import type { Service, DocumentSymbol, SymbolKind } from '@volar/language-service';
import * as html from 'vscode-html-languageservice';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import * as path from 'path';
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

// https://github.com/microsoft/vscode/blob/09850876e652688fb142e2e19fd00fd38c0bc4ba/extensions/html-language-features/server/src/htmlServer.ts#L183
const triggerCharacters = ['.', ':', '<', '"', '=', '/'];

export function create(options: {
	validLang?: string;
	disableCustomData?: boolean;
	useDefaultDataProvider?: boolean;
} = {}): Service<Provide> {
	return (context): ReturnType<Service<Provide>> => {

		if (!context) {
			return { triggerCharacters } as any;
		}

		let shouldUpdateCustomData = true;
		let customData: html.IHTMLDataProvider[] = [];
		let extraData: html.IHTMLDataProvider[] = [];
		const { useDefaultDataProvider = true } = options;

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
					if (document.languageId === (options.validLang ?? 'html')) {
						return getHtmlDocument(document);
					}
				},
				'html/languageService': () => htmlLs,
				'html/documentContext': () => documentContext,
				'html/updateCustomData': updateExtraCustomData,
			},

			triggerCharacters,

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
					// TODO: wait for https://github.com/microsoft/vscode-html-languageservice/pull/152
					const symbols: DocumentSymbol[] = [];
					htmlDocument.roots.forEach(node => {
						provideFileSymbolsInternal(document, node, symbols);
					});
					return symbols;
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

			async provideAutoInsertionEdit(document, position, insertContext) {
				return worker(document, async (htmlDocument) => {

					const lastCharacter = insertContext.lastChange.text[insertContext.lastChange.text.length - 1];

					if (insertContext.lastChange.rangeLength === 0 && lastCharacter === '=') {

						const enabled = (await context.env.getConfiguration?.<boolean>('html.autoCreateQuotes')) ?? true;

						if (enabled) {

							const text = htmlLs.doQuoteComplete(document, position, htmlDocument, await context.env.getConfiguration?.<html.CompletionConfiguration>('html.completion'));

							if (text) {
								return text;
							}
						}
					}

					if (insertContext.lastChange.rangeLength === 0 && (lastCharacter === '>' || lastCharacter === '/')) {

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
			if (shouldUpdateCustomData && !options.disableCustomData) {
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

			const customData: string[] = await context?.env.getConfiguration?.('html.customData') ?? [];
			const newData: html.IHTMLDataProvider[] = [];

			for (const customDataPath of customData) {
				try {
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

			if (document.languageId !== (options.validLang ?? 'html'))
				return;

			const htmlDocument = getHtmlDocument(document);
			if (!htmlDocument)
				return;

			await initCustomData();

			return callback(htmlDocument);
		}
	};
}

export default create;

function isEOL(content: string, offset: number) {
	return isNewlineCharacter(content.charCodeAt(offset));
}

const CR = '\r'.charCodeAt(0);
const NL = '\n'.charCodeAt(0);
function isNewlineCharacter(charCode: number) {
	return charCode === CR || charCode === NL;
}

function provideFileSymbolsInternal(document: TextDocument, node: html.Node, symbols: DocumentSymbol[]): void {

	const name = nodeToName(node);
	const range = {
		start: document.positionAt(node.start),
		end: document.positionAt(node.end),
	};
	const symbol: DocumentSymbol = {
		name,
		kind: 8 satisfies typeof SymbolKind.Field,
		range,
		selectionRange: range,
	};

	symbols.push(symbol);

	node.children.forEach(child => {
		symbol.children ??= [];
		provideFileSymbolsInternal(document, child, symbol.children);
	});
}

function nodeToName(node: html.Node): string {
	let name = node.tag;

	if (node.attributes) {
		const id = node.attributes['id'];
		const classes = node.attributes['class'];

		if (id) {
			name += `#${id.replace(/[\"\']/g, '')}`;
		}

		if (classes) {
			name += classes.replace(/[\"\']/g, '').split(/\s+/).map(className => `.${className}`).join('');
		}
	}

	return name || '?';
}
