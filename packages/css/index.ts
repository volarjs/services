import type { CodeAction, Diagnostic, Disposable, DocumentSelector, FormattingOptions, LocationLink, ProviderResult, LanguageServiceContext, LanguageServicePlugin, LanguageServicePluginInstance } from '@volar/language-service';
import * as css from 'vscode-css-languageservice';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI, Utils } from 'vscode-uri';

export interface Provide {
	'css/stylesheet': (document: TextDocument, ls: css.LanguageService) => css.Stylesheet;
	'css/languageService': (document: TextDocument) => css.LanguageService | undefined;
}

export function create({
	cssDocumentSelector = ['css'],
	scssDocumentSelector = ['scss'],
	lessDocumentSelector = ['less'],
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
	isFormattingEnabled = async (document, context) => {
		return await context.env.getConfiguration?.(document.languageId + '.format.enable') ?? true;
	},
	getFormattingOptions = async (document, options, context) => {
		return {
			...options,
			...await context.env.getConfiguration?.(document.languageId + '.format'),
		};
	},
	getLanguageSettings = async (document, context) => {
		return await context.env.getConfiguration?.(document.languageId);
	},
	getCustomData = async context => {
		const customData: string[] = await context.env.getConfiguration?.('css.customData') ?? [];
		const newData: css.ICSSDataProvider[] = [];
		for (const customDataPath of customData) {
			for (const workspaceFolder of context.env.workspaceFolders) {
				const uri = Utils.resolvePath(workspaceFolder, customDataPath);
				const json = await context.env.fs?.readFile?.(uri);
				if (json) {
					try {
						const data = JSON.parse(json);
						newData.push(css.newCSSDataProvider(data));
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
	cssDocumentSelector?: DocumentSelector,
	scssDocumentSelector?: DocumentSelector,
	lessDocumentSelector?: DocumentSelector,
	useDefaultDataProvider?: boolean;
	getDocumentContext?(context: LanguageServiceContext): css.DocumentContext;
	isFormattingEnabled?(document: TextDocument, context: LanguageServiceContext): ProviderResult<boolean>;
	getFormattingOptions?(document: TextDocument, options: FormattingOptions, context: LanguageServiceContext): ProviderResult<css.CSSFormatConfiguration>;
	getLanguageSettings?(document: TextDocument, context: LanguageServiceContext): ProviderResult<css.LanguageSettings | undefined>;
	getCustomData?(context: LanguageServiceContext): ProviderResult<css.ICSSDataProvider[]>;
	onDidChangeCustomData?(listener: () => void, context: LanguageServiceContext): Disposable;
} = {}): LanguageServicePlugin {
	return {
		name: 'css',
		capabilities: {
			completionProvider: {
				// https://github.com/microsoft/vscode/blob/09850876e652688fb142e2e19fd00fd38c0bc4ba/extensions/css-language-features/server/src/cssServer.ts#L97
				triggerCharacters: ['/', '-', ':'],
			},
			renameProvider: {
				prepareProvider: true,
			},
			codeActionProvider: {},
			definitionProvider: true,
			diagnosticProvider: {},
			hoverProvider: true,
			referencesProvider: true,
			documentHighlightProvider: true,
			documentLinkProvider: {},
			documentSymbolProvider: true,
			colorProvider: true,
			foldingRangeProvider: true,
			selectionRangeProvider: true,
			documentFormattingProvider: true,
		},
		create(context): LanguageServicePluginInstance<Provide> {

			const stylesheets = new WeakMap<TextDocument, [number, css.Stylesheet]>();
			const fileSystemProvider: css.FileSystemProvider = {
				stat: async uri => await context.env.fs?.stat(URI.parse(uri))
					?? { type: css.FileType.Unknown, ctime: 0, mtime: 0, size: 0 },
				readDirectory: async uri => await context.env.fs?.readDirectory(URI.parse(uri)) ?? [],
			};
			const documentContext = getDocumentContext(context);
			const disposable = onDidChangeCustomData(() => initializing = undefined, context);

			let cssLs: css.LanguageService | undefined;
			let scssLs: css.LanguageService | undefined;
			let lessLs: css.LanguageService | undefined;
			let customData: css.ICSSDataProvider[] = [];
			let initializing: Promise<void> | undefined;

			return {

				dispose() {
					disposable.dispose();
				},

				provide: {
					'css/stylesheet': getStylesheet,
					'css/languageService': getCssLs,
				},

				async provideCompletionItems(document, position) {
					return worker(document, async (stylesheet, cssLs) => {
						const settings = await getLanguageSettings(document, context);
						return await cssLs.doComplete2(document, position, stylesheet, documentContext, settings?.completion);
					});
				},

				provideRenameRange(document, position) {
					return worker(document, (stylesheet, cssLs) => {
						return cssLs.prepareRename(document, position, stylesheet);
					});
				},

				provideRenameEdits(document, position, newName) {
					return worker(document, (stylesheet, cssLs) => {
						return cssLs.doRename(document, position, newName, stylesheet);
					});
				},

				provideCodeActions(document, range, context) {
					return worker(document, (stylesheet, cssLs) => {
						return cssLs.doCodeActions2(document, range, context, stylesheet) as CodeAction[];
					});
				},

				provideDefinition(document, position) {
					return worker(document, (stylesheet, cssLs) => {
						const location = cssLs.findDefinition(document, position, stylesheet);
						if (location) {
							return [{
								targetUri: location.uri,
								targetRange: location.range,
								targetSelectionRange: location.range,
							} satisfies LocationLink];
						}
					});
				},

				async provideDiagnostics(document) {
					return worker(document, async (stylesheet, cssLs) => {
						const settings = await getLanguageSettings(document, context);
						return cssLs.doValidation(document, stylesheet, settings) as Diagnostic[];
					});
				},

				async provideHover(document, position) {
					return worker(document, async (stylesheet, cssLs) => {
						const settings = await getLanguageSettings(document, context);
						return cssLs.doHover(document, position, stylesheet, settings?.hover);
					});
				},

				provideReferences(document, position) {
					return worker(document, (stylesheet, cssLs) => {
						return cssLs.findReferences(document, position, stylesheet);
					});
				},

				provideDocumentHighlights(document, position) {
					return worker(document, (stylesheet, cssLs) => {
						return cssLs.findDocumentHighlights(document, position, stylesheet);
					});
				},

				async provideDocumentLinks(document) {
					return await worker(document, (stylesheet, cssLs) => {
						return cssLs.findDocumentLinks2(document, stylesheet, documentContext);
					});
				},

				provideDocumentSymbols(document) {
					return worker(document, (stylesheet, cssLs) => {
						return cssLs.findDocumentSymbols2(document, stylesheet);
					});
				},

				provideDocumentColors(document) {
					return worker(document, (stylesheet, cssLs) => {
						return cssLs.findDocumentColors(document, stylesheet);
					});
				},

				provideColorPresentations(document, color, range) {
					return worker(document, (stylesheet, cssLs) => {
						return cssLs.getColorPresentations(document, stylesheet, color, range);
					});
				},

				provideFoldingRanges(document) {
					return worker(document, (_stylesheet, cssLs) => {
						return cssLs.getFoldingRanges(document, context.env.clientCapabilities?.textDocument?.foldingRange);
					});
				},

				provideSelectionRanges(document, positions) {
					return worker(document, (stylesheet, cssLs) => {
						return cssLs.getSelectionRanges(document, positions, stylesheet);
					});
				},

				async provideDocumentFormattingEdits(document, formatRange, options, codeOptions) {
					return worker(document, async (_stylesheet, cssLs) => {

						if (!await isFormattingEnabled(document, context)) {
							return;
						}

						const formatOptions = await getFormattingOptions(document, options, context);

						let formatDocument = document;
						let prefixes = [];
						let suffixes = [];

						if (codeOptions?.initialIndentLevel) {
							for (let i = 0; i < codeOptions.initialIndentLevel; i++) {
								if (i === codeOptions.initialIndentLevel - 1) {
									prefixes.push('_', '{');
									suffixes.unshift('}');
								}
								else {
									prefixes.push('_', '{\n');
									suffixes.unshift('\n}');
								}
							}
							formatDocument = TextDocument.create(document.uri, document.languageId, document.version, prefixes.join('') + document.getText() + suffixes.join(''));
							formatRange = {
								start: formatDocument.positionAt(0),
								end: formatDocument.positionAt(formatDocument.getText().length),
							};
						}

						let edits = cssLs.format(formatDocument, formatRange, formatOptions);

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
							const verifyDocument = TextDocument.create(document.uri, document.languageId, document.version, '_ {' + newText + '}');
							const verifyEdits = cssLs.format(verifyDocument, undefined, formatOptions);
							let verifyText = TextDocument.applyEdits(verifyDocument, verifyEdits);
							verifyText = verifyText.trimStart().slice('_'.length);
							verifyText = verifyText.trim().slice('{'.length, -'}'.length);
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
			};

			function getCssLs(document: TextDocument): css.LanguageService | undefined {
				if (matchDocument(cssDocumentSelector, document)) {
					if (!cssLs) {
						cssLs = css.getCSSLanguageService({
							fileSystemProvider,
							clientCapabilities: context.env.clientCapabilities,
							useDefaultDataProvider,
							customDataProviders: customData,
						});
						cssLs.setDataProviders(useDefaultDataProvider, customData);
					}
					return cssLs;
				}
				else if (matchDocument(scssDocumentSelector, document)) {
					if (!scssLs) {
						scssLs = css.getSCSSLanguageService({
							fileSystemProvider,
							clientCapabilities: context.env.clientCapabilities,
							useDefaultDataProvider,
							customDataProviders: customData,
						});
						scssLs.setDataProviders(useDefaultDataProvider, customData);
					}
					return scssLs;
				}
				else if (matchDocument(lessDocumentSelector, document)) {
					if (!lessLs) {
						lessLs = css.getLESSLanguageService({
							fileSystemProvider,
							clientCapabilities: context.env.clientCapabilities,
							useDefaultDataProvider,
							customDataProviders: customData,
						});
						lessLs.setDataProviders(useDefaultDataProvider, customData);
					}
					return lessLs;
				}
			}

			async function worker<T>(document: TextDocument, callback: (stylesheet: css.Stylesheet, cssLs: css.LanguageService) => T) {

				const cssLs = getCssLs(document);
				if (!cssLs) {
					return;
				}

				await (initializing ??= initialize());

				return callback(getStylesheet(document, cssLs), cssLs);
			}

			function getStylesheet(document: TextDocument, ls: css.LanguageService) {

				const cache = stylesheets.get(document);
				if (cache) {
					const [cacheVersion, cacheStylesheet] = cache;
					if (cacheVersion === document.version) {
						return cacheStylesheet;
					}
				}

				const stylesheet = ls.parseStylesheet(document);
				stylesheets.set(document, [document.version, stylesheet]);

				return stylesheet;
			}

			async function initialize() {
				customData = await getCustomData(context);
				cssLs?.setDataProviders(useDefaultDataProvider, customData);
				scssLs?.setDataProviders(useDefaultDataProvider, customData);
				lessLs?.setDataProviders(useDefaultDataProvider, customData);
			}
		},
	};
}

function matchDocument(selector: DocumentSelector, document: TextDocument) {
	for (const sel of selector) {
		if (sel === document.languageId || (typeof sel === 'object' && sel.language === document.languageId)) {
			return true;
		}
	}
	return false;
}
