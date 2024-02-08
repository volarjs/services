import type { ServicePluginInstance, ServicePlugin } from '@volar/language-service';
import * as html from 'vscode-html-languageservice';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { URI, Utils } from 'vscode-uri';

const parserLs = html.getLanguageService();
const htmlDocuments = new WeakMap<TextDocument, [number, html.HTMLDocument]>();

export interface Provide {
	'html/htmlDocument': (document: TextDocument) => html.HTMLDocument | undefined;
	'html/languageService': () => html.LanguageService;
	'html/documentContext': () => html.DocumentContext;
	'html/updateCustomData': (extraData: html.IHTMLDataProvider[]) => void;
}

export function getHtmlDocument(document: TextDocument) {

	const cache = htmlDocuments.get(document);
	if (cache) {
		const [cacheVersion, cacheDoc] = cache;
		if (cacheVersion === document.version) {
			return cacheDoc;
		}
	}

	const doc = parserLs.parseHTMLDocument(document);
	htmlDocuments.set(document, [document.version, doc]);

	return doc;
}

export function create({
	languageId = 'html',
	useDefaultDataProvider = true,
	useCustomDataProviders = true,
}: {
	languageId?: string;
	useDefaultDataProvider?: boolean;
	useCustomDataProviders?: boolean;
} = {}): ServicePlugin {
	return {
		name: 'html',
		// https://github.com/microsoft/vscode/blob/09850876e652688fb142e2e19fd00fd38c0bc4ba/extensions/html-language-features/server/src/htmlServer.ts#L183
		triggerCharacters: ['.', ':', '<', '"', '=', '/'],
		create(context): ServicePluginInstance<Provide> {
			let shouldUpdateCustomData = true;
			let customData: html.IHTMLDataProvider[] = [];
			let extraData: html.IHTMLDataProvider[] = [];

			const fileSystemProvider: html.FileSystemProvider = {
				stat: async uri => await context.env.fs?.stat(uri) ?? {
					type: html.FileType.Unknown,
					ctime: 0,
					mtime: 0,
					size: 0,
				},
				readDirectory: async (uri) => context.env.fs?.readDirectory(uri) ?? [],
			};
			const documentContext: html.DocumentContext = {
				resolveReference(ref, base) {
					if (ref.match(/^\w[\w\d+.-]*:/)) {
						// starts with a schema
						return ref;
					}
					if (ref[0] === '/') { // resolve absolute path against the current workspace folder
						return base + ref;
					}
					const baseUri = URI.parse(base);
					const baseUriDir = baseUri.path.endsWith('/') ? baseUri : Utils.dirname(baseUri);
					return Utils.resolvePath(baseUriDir, ref).toString(true);
				},
			};
			const htmlLs = html.getLanguageService({
				fileSystemProvider,
				clientCapabilities: context.env.clientCapabilities,
			});

			context.env.onDidChangeConfiguration?.(() => {
				shouldUpdateCustomData = true;
			});

			return {

				provide: {
					'html/htmlDocument': (document) => {
						if (document.languageId === languageId) {
							return getHtmlDocument(document);
						}
					},
					'html/languageService': () => htmlLs,
					'html/documentContext': () => documentContext,
					'html/updateCustomData': updateExtraCustomData,
				},

				async provideCompletionItems(document, position) {
					return worker(document, async (htmlDocument) => {

						const configs = await context.env.getConfiguration?.<html.CompletionConfiguration>('html.completion');

						return htmlLs.doComplete2(document, position, htmlDocument, documentContext, configs);
					});
				},

				provideRenameRange(document, position) {
					return worker(document, (htmlDocument) => {
						const offset = document.offsetAt(position);
						return htmlLs
							.findDocumentHighlights(document, position, htmlDocument)
							?.find(h => offset >= document.offsetAt(h.range.start) && offset <= document.offsetAt(h.range.end))
							?.range;
					});
				},

				provideRenameEdits(document, position, newName) {
					return worker(document, (htmlDocument) => {
						return htmlLs.doRename(document, position, newName, htmlDocument);
					});
				},

				async provideHover(document, position) {
					return worker(document, async (htmlDocument) => {

						const hoverSettings = await context.env.getConfiguration?.<html.HoverSettings>('html.hover');

						return htmlLs.doHover(document, position, htmlDocument, hoverSettings);
					});
				},

				provideDocumentHighlights(document, position) {
					return worker(document, (htmlDocument) => {
						return htmlLs.findDocumentHighlights(document, position, htmlDocument);
					});
				},

				provideDocumentLinks(document) {
					return worker(document, () => {
						return htmlLs.findDocumentLinks(document, documentContext);
					});
				},

				provideDocumentSymbols(document) {
					return worker(document, (htmlDocument) => {
						return htmlLs.findDocumentSymbols2(document, htmlDocument);
					});
				},

				provideFoldingRanges(document) {
					return worker(document, () => {
						return htmlLs.getFoldingRanges(document);
					});
				},

				provideSelectionRanges(document, positions) {
					return worker(document, () => {
						return htmlLs.getSelectionRanges(document, positions);
					});
				},

				async provideDocumentFormattingEdits(document, formatRange, options) {
					return worker(document, async () => {

						const options_2 = await context.env.getConfiguration?.<html.HTMLFormatConfiguration & { enable: boolean; }>('html.format');
						if (options_2?.enable === false) {
							return;
						}

						{ // https://github.com/microsoft/vscode/blob/dce493cb6e36346ef2714e82c42ce14fc461b15c/extensions/html-language-features/server/src/modes/formatting.ts#L13-L23
							const endPos = formatRange.end;
							let endOffset = document.offsetAt(endPos);
							const content = document.getText();
							if (endPos.character === 0 && endPos.line > 0 && endOffset !== content.length) {
								// if selection ends after a new line, exclude that new line
								const prevLineStart = document.offsetAt({ line: endPos.line - 1, character: 0 });
								while (isEOL(content, endOffset - 1) && endOffset > prevLineStart) {
									endOffset--;
								}
								formatRange = {
									start: formatRange.start,
									end: document.positionAt(endOffset),
								};
							}
						}

						return htmlLs.format(document, formatRange, {
							...options_2,
							...options,
						});
					});
				},

				provideFormattingIndentSensitiveLines(document) {
					return worker(document, (htmlDocument) => {
						const lines: number[] = [];
						/**
						 * comments
						 */
						const scanner = htmlLs.createScanner(document.getText());
						let token = scanner.scan();
						let startCommentTagLine: number | undefined;
						while (token !== html.TokenType.EOS) {
							if (token === html.TokenType.StartCommentTag) {
								startCommentTagLine = document.positionAt(scanner.getTokenOffset()).line;
							}
							else if (token === html.TokenType.EndCommentTag) {
								const line = document.positionAt(scanner.getTokenOffset()).line;
								for (let i = startCommentTagLine! + 1; i <= line; i++) {
									lines.push(i);
								}
								startCommentTagLine = undefined;
							}
							else if (token === html.TokenType.AttributeValue) {
								const startLine = document.positionAt(scanner.getTokenOffset()).line;
								for (let i = 1; i < scanner.getTokenText().split('\n').length; i++) {
									lines.push(startLine + i);
								}
							}
							token = scanner.scan();
						}
						/**
						 * tags
						 */
						// https://github.com/beautify-web/js-beautify/blob/686f8c1b265990908ece86ce39291733c75c997c/js/src/html/options.js#L81
						const indentSensitiveTags = new Set(['pre', 'textarea']);
						htmlDocument.roots.forEach(function visit(node) {
							if (
								node.tag !== undefined
								&& node.startTagEnd !== undefined
								&& node.endTagStart !== undefined
								&& indentSensitiveTags.has(node.tag)
							) {
								for (let i = document.positionAt(node.startTagEnd).line + 1; i <= document.positionAt(node.endTagStart).line; i++) {
									lines.push(i);
								}
							}
							else {
								node.children.forEach(visit);
							}
						});
						return lines;
					});
				},

				provideLinkedEditingRanges(document, position) {
					return worker(document, (htmlDocument) => {

						const ranges = htmlLs.findLinkedEditingRanges(document, position, htmlDocument);

						if (!ranges)
							return;

						return { ranges };
					});
				},

				async provideAutoInsertionEdit(document, position, lastChange) {
					return worker(document, async (htmlDocument) => {

						const lastCharacter = lastChange.text[lastChange.text.length - 1];
						const rangeLengthIsZero = lastChange.range.start.line === lastChange.range.end.line
							&& lastChange.range.start.character === lastChange.range.end.character;

						if (rangeLengthIsZero && lastCharacter === '=') {

							const enabled = (await context.env.getConfiguration?.<boolean>('html.autoCreateQuotes')) ?? true;

							if (enabled) {

								const text = htmlLs.doQuoteComplete(document, position, htmlDocument, await context.env.getConfiguration?.<html.CompletionConfiguration>('html.completion'));

								if (text) {
									return text;
								}
							}
						}

						if (rangeLengthIsZero && (lastCharacter === '>' || lastCharacter === '/')) {

							const enabled = (await context.env.getConfiguration?.<boolean>('html.autoClosingTags')) ?? true;

							if (enabled) {

								const text = htmlLs.doTagComplete(document, position, htmlDocument);

								if (text) {
									return text;
								}
							}
						}
					});
				},
			};

			async function initCustomData() {
				if (shouldUpdateCustomData && useCustomDataProviders) {
					shouldUpdateCustomData = false;
					customData = await getCustomData();
					htmlLs.setDataProviders(useDefaultDataProvider, [...customData, ...extraData]);
				}
			}

			function updateExtraCustomData(data: html.IHTMLDataProvider[]) {
				extraData = data;
				htmlLs.setDataProviders(useDefaultDataProvider, [...customData, ...extraData]);
			}

			async function getCustomData() {

				const customData: string[] = await context.env.getConfiguration?.('html.customData') ?? [];
				const newData: html.IHTMLDataProvider[] = [];

				for (const customDataPath of customData) {
					try {
						const pathModuleName = 'path'; // avoid bundle
						const { posix: path } = require(pathModuleName) as typeof import('path');
						const jsonPath = path.resolve(customDataPath);
						newData.push(html.newHTMLDataProvider(customDataPath, require(jsonPath)));
					}
					catch (error) {
						console.error(error);
					}
				}

				return newData;
			}

			async function worker<T>(document: TextDocument, callback: (htmlDocument: html.HTMLDocument) => T) {

				if (document.languageId !== languageId)
					return;

				const htmlDocument = getHtmlDocument(document);
				if (!htmlDocument)
					return;

				await initCustomData();

				return callback(htmlDocument);
			}
		},
	};
}

function isEOL(content: string, offset: number) {
	return isNewlineCharacter(content.charCodeAt(offset));
}

const CR = '\r'.charCodeAt(0);
const NL = '\n'.charCodeAt(0);
function isNewlineCharacter(charCode: number) {
	return charCode === CR || charCode === NL;
}
