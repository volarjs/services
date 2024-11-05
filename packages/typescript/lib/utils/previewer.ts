/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as ts from 'typescript';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { URI } from 'vscode-uri';

function replaceLinks(text: string): string {
	return text
		// Http(s) links
		.replace(/\{@(link|linkplain|linkcode) (https?:\/\/[^ |}]+?)(?:[| ]([^{}\n]+?))?\}/gi, (_, tag: string, link: string, text?: string) => {
			switch (tag) {
				case 'linkcode':
					return `[\`${text ? text.trim() : link}\`](${link})`;

				default:
					return `[${text ? text.trim() : link}](${link})`;
			}
		});
}

function processInlineTags(text: string): string {
	return replaceLinks(text);
}

function getTagBodyText(
	tag: ts.server.protocol.JSDocTagInfo,
	fileNameToUri: (fileName: string) => URI,
	getTextDocument: (uri: URI) => TextDocument | undefined
): string | undefined {
	if (!tag.text) {
		return undefined;
	}

	// Convert to markdown code block if it is not already one
	function makeCodeblock(text: string): string {
		if (text.match(/^\s*[~`]{3}/g)) {
			return text;
		}
		return '```\n' + text + '\n```';
	}

	const text = convertLinkTags(tag.text, fileNameToUri, getTextDocument);
	switch (tag.name) {
		case 'example':
			// check for caption tags, fix for #79704
			const captionTagMatches = text.match(/<caption>(.*?)<\/caption>\s*(\r\n|\n)/);
			if (captionTagMatches && captionTagMatches.index === 0) {
				return captionTagMatches[1] + '\n\n' + makeCodeblock(text.slice(captionTagMatches[0].length));
			} else {
				return makeCodeblock(text);
			}
		case 'author':
			// fix obfuscated email address, #80898
			const emailMatch = text.match(/(.+)\s<([-.\w]+@[-.\w]+)>/);

			if (emailMatch === null) {
				return text;
			} else {
				return `${emailMatch[1]} ${emailMatch[2]}`;
			}
		case 'default':
			return makeCodeblock(text);
	}

	return processInlineTags(text);
}

function getTagDocumentation(
	tag: ts.server.protocol.JSDocTagInfo,
	fileNameToUri: (fileName: string) => URI,
	getTextDocument: (uri: URI) => TextDocument | undefined
): string | undefined {
	switch (tag.name) {
		case 'augments':
		case 'extends':
		case 'param':
		case 'template':
			const body = convertLinkTags(tag.text, fileNameToUri, getTextDocument).split(/^(\S+)\s*-?\s*/);
			if (body?.length === 3) {
				const param = body[1];
				const doc = body[2];
				const label = `*@${tag.name}* \`${param}\``;
				if (!doc) {
					return label;
				}
				return label + (doc.match(/\r\n|\n/g) ? '  \n' + processInlineTags(doc) : ` — ${processInlineTags(doc)}`);
			}
	}

	// Generic tag
	const label = `*@${tag.name}*`;
	const text = getTagBodyText(tag, fileNameToUri, getTextDocument);
	if (!text) {
		return label;
	}
	return label + (text.match(/\r\n|\n/g) ? '  \n' + text : ` — ${text}`);
}

export function plainWithLinks(
	parts: readonly ts.server.protocol.SymbolDisplayPart[] | string,
	fileNameToUri: (fileName: string) => URI,
	getTextDocument: (uri: URI) => TextDocument | undefined
): string {
	return processInlineTags(convertLinkTags(parts, fileNameToUri, getTextDocument));
}

/**
 * Convert `@link` inline tags to markdown links
 */
function convertLinkTags(
	parts: readonly ts.server.protocol.SymbolDisplayPart[] | string | undefined,
	fileNameToUri: (fileName: string) => URI,
	getTextDocument: (uri: URI) => TextDocument | undefined
): string {
	if (!parts) {
		return '';
	}

	if (typeof parts === 'string') {
		return parts;
	}

	const out: string[] = [];

	let currentLink: { name?: string, target?: ts.server.protocol.FileSpan, text?: string; } | undefined;
	for (const part of parts) {
		switch (part.kind) {
			case 'link':
				if (currentLink) {
					const text = currentLink.text ?? currentLink.name;
					let target = currentLink.target;

					if (typeof currentLink.target === 'object' && 'fileName' in currentLink.target) {
						const _target = currentLink.target as any as {
							fileName: string,
							textSpan: { start: number, length: number; },
						};
						const fileDoc = getTextDocument(fileNameToUri(_target.fileName));
						if (fileDoc) {
							const start = fileDoc.positionAt(_target.textSpan.start);
							const end = fileDoc.positionAt(_target.textSpan.start + _target.textSpan.length);
							target = {
								file: _target.fileName,
								start: {
									line: start.line + 1,
									offset: start.character + 1,
								},
								end: {
									line: end.line + 1,
									offset: end.character + 1,
								},
							};
						}
						else {
							target = {
								file: _target.fileName,
								start: {
									line: 1,
									offset: 1,
								},
								end: {
									line: 1,
									offset: 1,
								},
							};
						}
					}

					if (target) {
						const link = fileNameToUri(target.file) + '#' + `L${target.start.line},${target.start.offset}`;

						out.push(`[${text}](${link})`);
					} else {
						if (text) {
							out.push(text);
						}
					}
					currentLink = undefined;
				} else {
					currentLink = {};
				}
				break;

			case 'linkName':
				if (currentLink) {
					currentLink.name = part.text;
					currentLink.target = (part as ts.server.protocol.JSDocLinkDisplayPart).target;
				}
				break;

			case 'linkText':
				if (currentLink) {
					currentLink.text = part.text;
				}
				break;

			default:
				out.push(part.text);
				break;
		}
	}
	return processInlineTags(out.join(''));
}

export function tagsMarkdownPreview(
	tags: readonly ts.JSDocTagInfo[],
	fileNameToUri: (fileName: string) => URI,
	getTextDocument: (uri: URI) => TextDocument | undefined
): string {
	return tags.map(tag => getTagDocumentation(tag, fileNameToUri, getTextDocument)).join('  \n\n');
}

export function markdownDocumentation(
	documentation: ts.server.protocol.SymbolDisplayPart[] | string | undefined,
	tags: ts.JSDocTagInfo[] | undefined,
	fileNameToUri: (fileName: string) => URI,
	getTextDocument: (uri: URI) => TextDocument | undefined
): string {
	return addMarkdownDocumentation('', documentation, tags, fileNameToUri, getTextDocument);
}

export function addMarkdownDocumentation(
	out: string,
	documentation: ts.server.protocol.SymbolDisplayPart[] | string | undefined,
	tags: ts.JSDocTagInfo[] | undefined,
	fileNameToUri: (fileName: string) => URI,
	getTextDocument: (uri: URI) => TextDocument | undefined
): string {
	if (documentation) {
		out += plainWithLinks(documentation, fileNameToUri, getTextDocument);
	}

	if (tags) {
		const tagsPreview = tagsMarkdownPreview(tags, fileNameToUri, getTextDocument);
		if (tagsPreview) {
			out += '\n\n' + tagsPreview;
		}
	}
	return out;
}
