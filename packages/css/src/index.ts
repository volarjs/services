import type { CodeAction, Diagnostic, LocationLink, ServicePluginInstance, ServicePlugin } from '@volar/language-service';
import * as css from 'vscode-css-languageservice';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { URI, Utils } from 'vscode-uri';

export interface Provide {
	'css/stylesheet': (document: TextDocument) => css.Stylesheet | undefined;
	'css/languageService': (languageId: string) => css.LanguageService | undefined;
}

export function create(): ServicePlugin {
	return {
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
				readDirectory: async (uri) => context.env.fs?.readDirectory(uri) ?? [],
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
					return worker(document, (stylesheet, cssLs) => {
						return cssLs.getFoldingRanges(document, stylesheet);
					});
				},

				provideSelectionRanges(document, positions) {
					return worker(document, (stylesheet, cssLs) => {
						return cssLs.getSelectionRanges(document, positions, stylesheet);
					});
				},

				async provideDocumentFormattingEdits(document, formatRange, options) {
					return worker(document, async (_stylesheet, cssLs) => {

						const options_2 = await context.env.getConfiguration?.<css.CSSFormatConfiguration & { enable: boolean; }>(document.languageId + '.format');
						if (options_2?.enable === false) {
							return;
						}

						return cssLs.format(document, formatRange, {
							...options_2,
							...options,
						});
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
