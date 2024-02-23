import type { CodeAction, Diagnostic, LocationLink, ServicePluginInstance, ServicePlugin } from '@volar/language-service';
import * as css from 'vscode-css-languageservice';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI, Utils } from 'vscode-uri';

export interface Provide {
	'css/stylesheet': (document: TextDocument) => css.Stylesheet | undefined;
	'css/languageService': (languageId: string) => css.LanguageService | undefined;
}

export function create(): ServicePlugin {
	return {
		name: 'css',
		// https://github.com/microsoft/vscode/blob/09850876e652688fb142e2e19fd00fd38c0bc4ba/extensions/css-language-features/server/src/cssServer.ts#L97
		triggerCharacters: ['/', '-', ':'],
		create(context): ServicePluginInstance<Provide> {

			let inited = false;

			const stylesheets = new WeakMap<TextDocument, [number, css.Stylesheet]>();
			const fileSystemProvider: css.FileSystemProvider = {
				stat: async uri => await context.env.fs?.stat(uri) ?? {
					type: css.FileType.Unknown,
					ctime: 0,
					mtime: 0,
					size: 0,
				},
				readDirectory: async (uri) => await context.env.fs?.readDirectory(uri) ?? [],
			};
			const documentContext: css.DocumentContext = {
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
			const cssLs = css.getCSSLanguageService({
				fileSystemProvider,
				clientCapabilities: context.env.clientCapabilities,
			});
			const scssLs = css.getSCSSLanguageService({
				fileSystemProvider,
				clientCapabilities: context.env.clientCapabilities,
			});
			const lessLs = css.getLESSLanguageService({
				fileSystemProvider,
				clientCapabilities: context.env.clientCapabilities,
			});
			const postcssLs: css.LanguageService = {
				...scssLs,
				doValidation: (document, stylesheet, documentSettings) => {
					let errors = scssLs.doValidation(document, stylesheet, documentSettings);
					errors = errors.filter(error => error.code !== 'css-semicolonexpected');
					errors = errors.filter(error => error.code !== 'css-ruleorselectorexpected');
					errors = errors.filter(error => error.code !== 'unknownAtRules');
					return errors;
				},
			};

			return {

				provide: {
					'css/stylesheet': getStylesheet,
					'css/languageService': getCssLs,
				},

				async provideCompletionItems(document, position) {
					return worker(document, async (stylesheet, cssLs) => {

						const settings = await context.env.getConfiguration?.<css.LanguageSettings>(document.languageId);
						const cssResult = await cssLs.doComplete2(document, position, stylesheet, documentContext, settings?.completion);

						return cssResult;
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

						const settings = await context.env.getConfiguration?.<css.LanguageSettings>(document.languageId);

						return cssLs.doValidation(document, stylesheet, settings) as Diagnostic[];
					});
				},

				async provideHover(document, position) {
					return worker(document, async (stylesheet, cssLs) => {

						const settings = await context.env.getConfiguration?.<css.LanguageSettings>(document.languageId);

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

						const formatSettings = await context.env.getConfiguration?.<css.CSSFormatConfiguration & { enable: boolean; }>(document.languageId + '.format');
						if (formatSettings?.enable === false) {
							return;
						}

						const formatOptions: css.CSSFormatConfiguration = {
							...options,
							...formatSettings,
						};

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

			async function initCustomData() {
				if (!inited) {

					context.env.onDidChangeConfiguration?.(async () => {
						const customData = await getCustomData();
						cssLs.setDataProviders(true, customData);
						scssLs.setDataProviders(true, customData);
						lessLs.setDataProviders(true, customData);
					});

					const customData = await getCustomData();
					cssLs.setDataProviders(true, customData);
					scssLs.setDataProviders(true, customData);
					lessLs.setDataProviders(true, customData);
					inited = true;
				}
			}

			async function getCustomData() {

				const customData: string[] = await context.env.getConfiguration?.('css.customData') ?? [];
				const newData: css.ICSSDataProvider[] = [];

				for (const customDataPath of customData) {
					try {
						const pathModuleName = 'path'; // avoid bundle
						const { posix: path } = require(pathModuleName) as typeof import('path');
						const jsonPath = path.resolve(customDataPath);
						newData.push(css.newCSSDataProvider(require(jsonPath)));
					}
					catch (error) {
						console.error(error);
					}
				}

				return newData;
			}

			function getCssLs(lang: string) {
				switch (lang) {
					case 'css': return cssLs;
					case 'scss': return scssLs;
					case 'less': return lessLs;
					case 'postcss': return postcssLs;
				}
			}

			function getStylesheet(document: TextDocument) {

				const cache = stylesheets.get(document);
				if (cache) {
					const [cacheVersion, cacheStylesheet] = cache;
					if (cacheVersion === document.version) {
						return cacheStylesheet;
					}
				}

				const cssLs = getCssLs(document.languageId);
				if (!cssLs)
					return;

				const stylesheet = cssLs.parseStylesheet(document);
				stylesheets.set(document, [document.version, stylesheet]);

				return stylesheet;
			}

			async function worker<T>(document: TextDocument, callback: (stylesheet: css.Stylesheet, cssLs: css.LanguageService) => T) {

				const stylesheet = getStylesheet(document);
				if (!stylesheet)
					return;

				const cssLs = getCssLs(document.languageId);
				if (!cssLs)
					return;

				await initCustomData();

				return callback(stylesheet, cssLs);
			}
		},
	};
}
