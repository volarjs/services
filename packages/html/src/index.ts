import type { LanguageServicePluginContext, LanguageServicePluginInstance } from '@volar/language-service';
import * as html from 'vscode-html-languageservice';
import * as vscode from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as path from 'path';

export interface PluginInstance extends LanguageServicePluginInstance {
	getHtmlLs: () => html.LanguageService;
	updateCustomData(extraData: html.IHTMLDataProvider[]): void;
}

export default (options: {
	validLang?: string,
	disableCustomData?: boolean,
} = {}) => (context: LanguageServicePluginContext | undefined): PluginInstance => {

	const triggerCharacters: LanguageServicePluginInstance = {
		// https://github.com/microsoft/vscode/blob/09850876e652688fb142e2e19fd00fd38c0bc4ba/extensions/html-language-features/server/src/htmlServer.ts#L183
		triggerCharacters: ['.', ':', '<', '"', '=', '/'],
	};
	if (!context) {
		return triggerCharacters as any;
	}

	let shouldUpdateCustomData = true;
	let customData: html.IHTMLDataProvider[] = [];
	let extraData: html.IHTMLDataProvider[] = [];

	const htmlLs = html.getLanguageService({ fileSystemProvider: context.fileSystemProvider });
	const htmlDocuments = new WeakMap<TextDocument, [number, html.HTMLDocument]>();

	context.configurationHost?.onDidChangeConfiguration(() => {
		shouldUpdateCustomData = true;
	});

	return {

		...triggerCharacters,

		async resolveRuleContext(context) {
			if (options.validLang === 'html') {
				await worker(context.document, (htmlDocument) => {
					context.html = {
						document: htmlDocument,
						languageService: htmlLs,
					};
				});
			}
			return context;
		},

		getHtmlLs: () => htmlLs,

		updateCustomData: updateExtraCustomData,

		async provideCompletionItems(document, position) {
			return worker(document, async (htmlDocument) => {

				const configs = await context.configurationHost?.getConfiguration<html.CompletionConfiguration>('html.completion');

				if (context.documentContext) {
					return htmlLs.doComplete2(document, position, htmlDocument, context.documentContext, configs);
				}
				else {
					return htmlLs.doComplete(document, position, htmlDocument, configs);
				}
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

				const hoverSettings = await context.configurationHost?.getConfiguration<html.HoverSettings>('html.hover');

				return htmlLs.doHover(document, position, htmlDocument, hoverSettings);
			});
		},

		provideDocumentHighlights(document, position) {
			return worker(document, (htmlDocument) => {
				return htmlLs.findDocumentHighlights(document, position, htmlDocument);
			});
		},

		provideLinks(document) {
			return worker(document, () => {

				if (!context.documentContext)
					return;

				return htmlLs.findDocumentLinks(document, context.documentContext);
			});
		},

		provideDocumentSymbols(document) {
			return worker(document, (htmlDocument) => {
				// TODO: wait for https://github.com/microsoft/vscode-html-languageservice/pull/152
				const symbols: vscode.DocumentSymbol[] = [];
				htmlDocument.roots.forEach(node => {
					provideFileSymbolsInternal(document, node, symbols);
				});
				// console.log(symbols);
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

				const options_2 = await context.configurationHost?.getConfiguration<html.HTMLFormatConfiguration & { enable: boolean; }>('html.format');
				if (options_2?.enable === false) {
					return;
				}

				{ // https://github.com/microsoft/vscode/blob/dce493cb6e36346ef2714e82c42ce14fc461b15c/extensions/html-language-features/server/src/modes/formatting.ts#L13-L23
					const endPos = formatRange.end;
					let endOffset = document.offsetAt(endPos);
					const content = document.getText();
					if (endPos.character === 0 && endPos.line > 0 && endOffset !== content.length) {
						// if selection ends after a new line, exclude that new line
						const prevLineStart = document.offsetAt(vscode.Position.create(endPos.line - 1, 0));
						while (isEOL(content, endOffset - 1) && endOffset > prevLineStart) {
							endOffset--;
						}
						formatRange = vscode.Range.create(formatRange.start, document.positionAt(endOffset));
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
					token = scanner.scan();
				}
				/**
				 * tags
				 */
				htmlDocument.roots.forEach(function visit(node) {
					// TODO: check source code for all sensitive tags
					if (node.tag === 'pre' && node.startTagEnd !== undefined && node.endTagStart !== undefined) {
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

					const enabled = (await context.configurationHost?.getConfiguration<boolean>('html.autoCreateQuotes')) ?? true;

					if (enabled) {

						const text = htmlLs.doQuoteComplete(document, position, htmlDocument, await context.configurationHost?.getConfiguration<html.CompletionConfiguration>('html.completion'));

						if (text) {
							return text;
						}
					}
				}

				if (insertContext.lastChange.rangeLength === 0 && (lastCharacter === '>' || lastCharacter === '/')) {

					const enabled = (await context.configurationHost?.getConfiguration<boolean>('html.autoClosingTags')) ?? true;

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
			htmlLs.setDataProviders(true, [...customData, ...extraData]);
		}
	}

	function updateExtraCustomData(data: html.IHTMLDataProvider[]) {
		extraData = data;
		htmlLs.setDataProviders(true, [...customData, ...extraData]);
	}

	async function getCustomData() {

		const configHost = context?.configurationHost;

		if (configHost) {

			const customData: string[] = await configHost.getConfiguration('html.customData') ?? [];
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

		return [];
	}

	async function worker<T>(document: TextDocument, callback: (htmlDocument: html.HTMLDocument) => T) {

		const htmlDocument = getHtmlDocument(document);
		if (!htmlDocument)
			return;

		await initCustomData();

		return callback(htmlDocument);
	}

	function getHtmlDocument(document: TextDocument) {

		if (document.languageId !== (options.validLang ?? 'html'))
			return;

		const cache = htmlDocuments.get(document);
		if (cache) {
			const [cacheVersion, cacheDoc] = cache;
			if (cacheVersion === document.version) {
				return cacheDoc;
			}
		}

		const doc = htmlLs.parseHTMLDocument(document);
		htmlDocuments.set(document, [document.version, doc]);

		return doc;
	}
};

function isEOL(content: string, offset: number) {
	return isNewlineCharacter(content.charCodeAt(offset));
}

const CR = '\r'.charCodeAt(0);
const NL = '\n'.charCodeAt(0);
function isNewlineCharacter(charCode: number) {
	return charCode === CR || charCode === NL;
}

function provideFileSymbolsInternal(document: TextDocument, node: html.Node, symbols: vscode.DocumentSymbol[]): void {

	const name = nodeToName(node);
	const range = vscode.Range.create(document.positionAt(node.start), document.positionAt(node.end));
	const symbol = vscode.DocumentSymbol.create(
		name,
		undefined,
		vscode.SymbolKind.Field,
		range,
		range,
	);

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
