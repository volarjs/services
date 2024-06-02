import type { Disposable, DocumentSelector, FormattingOptions, ProviderResult, LanguageServiceContext, LanguageServicePlugin, LanguageServicePluginInstance } from '@volar/language-service';
import * as html from 'vscode-html-languageservice';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI, Utils } from 'vscode-uri';


export interface Provide {
	'html/htmlDocument': (document: TextDocument) => html.HTMLDocument | undefined;
	'html/languageService': () => html.LanguageService;
	'html/documentContext': () => html.DocumentContext;
}

export function create({
	documentSelector = ['html'],
	configurationSections = {
		autoCreateQuotes: 'html.autoCreateQuotes',
		autoClosingTags: 'html.autoClosingTags',
	},
	useDefaultDataProvider = true,
	getDocumentContext = context => {
		return {
			resolveReference(ref, base) {
				let baseUri = URI.parse(base);
				const decoded = context.decodeEmbeddedDocumentUri(baseUri);
				if (decoded) {
					baseUri = decoded[0];
				}
				if (ref.match(/^\w[\w\d+.-]*:/)) {
					// starts with a schema
					return ref;
				}
				if (ref[0] === '/' && context.env.workspaceFolders.length) { // resolve absolute path against the current workspace folder
					let folderUri = context.env.workspaceFolders[0].toString();
					if (!folderUri.endsWith('/')) {
						folderUri += '/';
					}
					return folderUri + ref.substring(1);
				}
				const baseUriDir = baseUri.path.endsWith('/') ? baseUri : Utils.dirname(baseUri);
				return Utils.resolvePath(baseUriDir, ref).toString(true);
			},
		};
	},
	isFormattingEnabled = async (_document, context) => {
		return await context.env.getConfiguration?.('html.format.enable') ?? true;
	},
	getFormattingOptions = async (_document, options, context) => {
		const formatSettings: html.FormattingOptions = {
			...options,
			endWithNewline: options.insertFinalNewline ? true : options.trimFinalNewlines ? false : undefined,
			...await context.env.getConfiguration?.('html.format'),
		};
		// https://github.com/microsoft/vscode/blob/a8f73340be02966c3816a2f23cb7e446a3a7cb9b/extensions/html-language-features/server/src/modes/htmlMode.ts#L47-L51
		if (formatSettings.contentUnformatted) {
			formatSettings.contentUnformatted = formatSettings.contentUnformatted + ',script';
		} else {
			formatSettings.contentUnformatted = 'script';
		}
		return formatSettings;
	},
	getCompletionConfiguration = async (_document, context) => {
		return await context.env.getConfiguration?.('html.completion');
	},
	getHoverSettings = async (_document, context) => {
		return await context.env.getConfiguration?.('html.hover');
	},
	getCustomData = async context => {
		const customData: string[] = await context.env.getConfiguration?.('html.customData') ?? [];
		const newData: html.IHTMLDataProvider[] = [];
		for (const customDataPath of customData) {
			for (const workspaceFolder of context.env.workspaceFolders) {
				const uri = Utils.resolvePath(workspaceFolder, customDataPath);
				const json = await context.env.fs?.readFile?.(uri);
				if (json) {
					try {
						const data = JSON.parse(json);
						newData.push(html.newHTMLDataProvider(customDataPath, data));
					}
					catch (error) {
						console.error(error);
					}
					break;
				}
			}
		}
		return newData;
	},
	onDidChangeCustomData = (listener, context) => {
		const disposable = context.env.onDidChangeConfiguration?.(listener);
		return {
			dispose() {
				disposable?.dispose();
			},
		};
	},
}: {
	documentSelector?: DocumentSelector;
	configurationSections?: {
		autoCreateQuotes: string;
		autoClosingTags: string;
	};
	useDefaultDataProvider?: boolean;
	isFormattingEnabled?(document: TextDocument, context: LanguageServiceContext): ProviderResult<boolean>;
	isAutoCreateQuotesEnabled?(document: TextDocument, context: LanguageServiceContext): ProviderResult<boolean>;
	isAutoClosingTagsEnabled?(document: TextDocument, context: LanguageServiceContext): ProviderResult<boolean>;
	getDocumentContext?(context: LanguageServiceContext): html.DocumentContext;
	getFormattingOptions?(document: TextDocument, options: FormattingOptions, context: LanguageServiceContext): ProviderResult<html.HTMLFormatConfiguration>;
	getCompletionConfiguration?(document: TextDocument, context: LanguageServiceContext): ProviderResult<html.CompletionConfiguration | undefined>;
	getHoverSettings?(document: TextDocument, context: LanguageServiceContext): ProviderResult<html.HoverSettings | undefined>;
	getCustomData?(context: LanguageServiceContext): ProviderResult<html.IHTMLDataProvider[]>;
	onDidChangeCustomData?(listener: () => void, context: LanguageServiceContext): Disposable;
} = {}): LanguageServicePlugin {
	return {
		name: 'html',
		capabilities: {
			completionProvider: {
				// https://github.com/microsoft/vscode/blob/09850876e652688fb142e2e19fd00fd38c0bc4ba/extensions/html-language-features/server/src/htmlServer.ts#L183
				triggerCharacters: ['.', ':', '<', '"', '=', '/'],
			},
			renameProvider: {
				prepareProvider: true,
			},
			hoverProvider: true,
			documentHighlightProvider: true,
			documentLinkProvider: {},
			documentSymbolProvider: true,
			foldingRangeProvider: true,
			selectionRangeProvider: true,
			documentFormattingProvider: true,
			linkedEditingRangeProvider: true,
			autoInsertionProvider: {
				triggerCharacters: ['=', '>', '/'],
				configurationSections: [
					configurationSections.autoCreateQuotes,
					configurationSections.autoClosingTags,
					configurationSections.autoClosingTags,
				],
			},
		},
		create(context): LanguageServicePluginInstance<Provide> {

			const htmlDocuments = new WeakMap<TextDocument, [number, html.HTMLDocument]>();
			const fileSystemProvider: html.FileSystemProvider = {
				stat: async uri => await context.env.fs?.stat(URI.parse(uri))
					?? { type: html.FileType.Unknown, ctime: 0, mtime: 0, size: 0 },
				readDirectory: async uri => await context.env.fs?.readDirectory(URI.parse(uri)) ?? [],
			};
			const documentContext = getDocumentContext(context);
			const htmlLs = html.getLanguageService({
				fileSystemProvider,
				clientCapabilities: context.env.clientCapabilities,
				useDefaultDataProvider,
			});
			const disposable = onDidChangeCustomData(() => initializing = undefined, context);

			let initializing: Promise<void> | undefined;

			return {

				dispose() {
					disposable.dispose();
				},

				provide: {
					'html/htmlDocument': document => {
						if (matchDocument(documentSelector, document)) {
							return getHtmlDocument(document);
						}
					},
					'html/languageService': () => htmlLs,
					'html/documentContext': () => documentContext,
				},

				async provideCompletionItems(document, position) {
					return worker(document, async htmlDocument => {
						const configs = await getCompletionConfiguration(document, context);
						return htmlLs.doComplete2(document, position, htmlDocument, documentContext, configs);
					});
				},

				provideRenameRange(document, position) {
					return worker(document, htmlDocument => {
						const offset = document.offsetAt(position);
						return htmlLs
							.findDocumentHighlights(document, position, htmlDocument)
							?.find(h => offset >= document.offsetAt(h.range.start) && offset <= document.offsetAt(h.range.end))
							?.range;
					});
				},

				provideRenameEdits(document, position, newName) {
					return worker(document, htmlDocument => {
						return htmlLs.doRename(document, position, newName, htmlDocument);
					});
				},

				async provideHover(document, position) {
					return worker(document, async htmlDocument => {
						const hoverSettings = await getHoverSettings(document, context);
						return htmlLs.doHover(document, position, htmlDocument, hoverSettings);
					});
				},

				provideDocumentHighlights(document, position) {
					return worker(document, htmlDocument => {
						return htmlLs.findDocumentHighlights(document, position, htmlDocument);
					});
				},

				provideDocumentLinks(document) {
					return worker(document, () => {
						return htmlLs.findDocumentLinks(document, documentContext);
					});
				},

				provideDocumentSymbols(document) {
					return worker(document, htmlDocument => {
						return htmlLs.findDocumentSymbols2(document, htmlDocument);
					});
				},

				provideFoldingRanges(document) {
					return worker(document, () => {
						return htmlLs.getFoldingRanges(document, context.env.clientCapabilities?.textDocument?.foldingRange);
					});
				},

				provideSelectionRanges(document, positions) {
					return worker(document, () => {
						return htmlLs.getSelectionRanges(document, positions);
					});
				},

				async provideDocumentFormattingEdits(document, formatRange, options, codeOptions) {
					return worker(document, async () => {

						if (!await isFormattingEnabled(document, context)) {
							return;
						}

						// https://github.com/microsoft/vscode/blob/dce493cb6e36346ef2714e82c42ce14fc461b15c/extensions/html-language-features/server/src/modes/formatting.ts#L13-L23
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

						const formatSettings = await getFormattingOptions(document, options, context);

						let formatDocument = document;
						let prefixes = [];
						let suffixes = [];

						if (codeOptions?.initialIndentLevel) {
							for (let i = 0; i < codeOptions.initialIndentLevel; i++) {
								if (i === codeOptions.initialIndentLevel - 1) {
									prefixes.push('<template>');
									suffixes.unshift('</template>');
								}
								else {
									prefixes.push('<template>\n');
									suffixes.unshift('\n</template>');
								}
							}
							formatDocument = TextDocument.create(document.uri, document.languageId, document.version, prefixes.join('') + document.getText() + suffixes.join(''));
							formatRange = {
								start: formatDocument.positionAt(0),
								end: formatDocument.positionAt(formatDocument.getText().length),
							};
						}

						let edits = htmlLs.format(formatDocument, formatRange, formatSettings);

						if (codeOptions) {
							let newText = TextDocument.applyEdits(formatDocument, edits);
							for (const prefix of prefixes) {
								newText = newText.trimStart().slice(prefix.trim().length);
							}
							for (const suffix of suffixes.reverse()) {
								newText = newText.trimEnd().slice(0, -suffix.trim().length);
							}
							if (!codeOptions.initialIndentLevel && codeOptions.level > 0) {
								newText = ensureNewLines(newText);
							}
							edits = [{
								range: {
									start: document.positionAt(0),
									end: document.positionAt(document.getText().length),
								},
								newText,
							}];
						}

						return edits;

						function ensureNewLines(newText: string) {
							const verifyDocument = TextDocument.create(document.uri, document.languageId, document.version, '<template>' + newText + '</template>');
							const verifyEdits = htmlLs.format(verifyDocument, undefined, formatSettings);
							let verifyText = TextDocument.applyEdits(verifyDocument, verifyEdits);
							verifyText = verifyText.trim().slice('<template>'.length, -'</template>'.length);
							if (startWithNewLine(verifyText) !== startWithNewLine(newText)) {
								if (startWithNewLine(verifyText)) {
									newText = '\n' + newText;
								}
								else if (newText.startsWith('\n')) {
									newText = newText.slice(1);
								}
								else if (newText.startsWith('\r\n')) {
									newText = newText.slice(2);
								}
							}
							if (endWithNewLine(verifyText) !== endWithNewLine(newText)) {
								if (endWithNewLine(verifyText)) {
									newText = newText + '\n';
								}
								else if (newText.endsWith('\n')) {
									newText = newText.slice(0, -1);
								}
								else if (newText.endsWith('\r\n')) {
									newText = newText.slice(0, -2);
								}
							}
							return newText;
						}

						function startWithNewLine(text: string) {
							return text.startsWith('\n') || text.startsWith('\r\n');
						}

						function endWithNewLine(text: string) {
							return text.endsWith('\n') || text.endsWith('\r\n');
						}
					});
				},

				provideLinkedEditingRanges(document, position) {
					return worker(document, htmlDocument => {

						const ranges = htmlLs.findLinkedEditingRanges(document, position, htmlDocument);

						if (!ranges) {
							return;
						}

						return { ranges };
					});
				},

				async provideAutoInsertSnippet(document, selection, change) {
					// selection must at end of change
					if (document.offsetAt(selection) !== change.rangeOffset + change.text.length) {
						return;
					}
					return worker(document, async htmlDocument => {
						if (change.rangeLength === 0 && change.text.endsWith('=')) {

							const enabled = await context.env.getConfiguration?.(configurationSections.autoCreateQuotes) ?? true;

							if (enabled) {

								const completionConfiguration = await getCompletionConfiguration(document, context);
								const text = htmlLs.doQuoteComplete(document, selection, htmlDocument, completionConfiguration);

								if (text) {
									return text;
								}
							}
						}
						if (change.rangeLength === 0 && (change.text.endsWith('>') || change.text.endsWith('/'))) {

							const enabled = await context.env.getConfiguration?.(configurationSections.autoClosingTags) ?? true;

							if (enabled) {

								const text = htmlLs.doTagComplete(document, selection, htmlDocument);

								if (text) {
									return text;
								}
							}
						}
					});
				},
			};

			function getHtmlDocument(document: TextDocument) {

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

			async function worker<T>(document: TextDocument, callback: (htmlDocument: html.HTMLDocument) => T) {

				if (!matchDocument(documentSelector, document)) {
					return;
				}

				const htmlDocument = getHtmlDocument(document);
				if (!htmlDocument) {
					return;
				}

				await (initializing ??= initialize());

				return callback(htmlDocument);
			}

			async function initialize() {
				const customData = await getCustomData(context);
				htmlLs.setDataProviders(useDefaultDataProvider, customData);
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

function matchDocument(selector: DocumentSelector, document: TextDocument) {
	for (const sel of selector) {
		if (sel === document.languageId || (typeof sel === 'object' && sel.language === document.languageId)) {
			return true;
		}
	}
	return false;
}
