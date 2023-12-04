import type { ServicePlugin, Diagnostic } from '@volar/language-service';
import * as json from 'vscode-json-languageservice';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { URI, Utils } from 'vscode-uri';

export interface Provide {
	'json/jsonDocument': (document: TextDocument) => json.JSONDocument | undefined;
	'json/languageService': () => json.LanguageService;
}

export function create(settings?: json.LanguageSettings): ServicePlugin<Provide> {
	return {
		// https://github.com/microsoft/vscode/blob/09850876e652688fb142e2e19fd00fd38c0bc4ba/extensions/json-language-features/server/src/jsonServer.ts#L150
		triggerCharacters: ['"', ':'],
		create(context) {

			const jsonDocuments = new WeakMap<TextDocument, [number, json.JSONDocument]>();
			const workspaceContext: json.WorkspaceContextService = {
				resolveRelativePath: (ref: string, base: string) => {
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
			const jsonLs = json.getLanguageService({
				schemaRequestService: async (uri) => await context.env.fs?.readFile(uri) ?? '',
				workspaceContext,
				clientCapabilities: context.env.clientCapabilities,
			});

			if (settings) {
				jsonLs.configure(settings);
			}

			return {

				provide: {
					'json/jsonDocument': getJsonDocument,
					'json/languageService': () => jsonLs,
				},

				provideCompletionItems(document, position) {
					return worker(document, async (jsonDocument) => {
						return await jsonLs.doComplete(document, position, jsonDocument);
					});
				},

				resolveCompletionItem(item) {
					return jsonLs.doResolve(item);
				},

				provideDefinition(document, position) {
					return worker(document, async (jsonDocument) => {
						return await jsonLs.findDefinition(document, position, jsonDocument);
					});
				},

				provideDiagnostics(document) {
					return worker(document, async (jsonDocument) => {

						const documentLanguageSettings = undefined; // await getSettings(); // TODO

						return await jsonLs.doValidation(
							document,
							jsonDocument,
							documentLanguageSettings,
							undefined, // TODO
						) as Diagnostic[];
					});
				},

				provideHover(document, position) {
					return worker(document, async (jsonDocument) => {
						return await jsonLs.doHover(document, position, jsonDocument);
					});
				},

				provideDocumentLinks(document) {
					return worker(document, async (jsonDocument) => {
						return await jsonLs.findLinks(document, jsonDocument);
					});
				},

				provideDocumentSymbols(document) {
					return worker(document, async (jsonDocument) => {
						return await jsonLs.findDocumentSymbols2(document, jsonDocument);
					});
				},

				provideDocumentColors(document) {
					return worker(document, async (jsonDocument) => {
						return await jsonLs.findDocumentColors(document, jsonDocument);
					});
				},

				provideColorPresentations(document, color, range) {
					return worker(document, async (jsonDocument) => {
						return await jsonLs.getColorPresentations(document, jsonDocument, color, range);
					});
				},

				provideFoldingRanges(document) {
					return worker(document, async () => {
						return await jsonLs.getFoldingRanges(document);
					});
				},

				provideSelectionRanges(document, positions) {
					return worker(document, async (jsonDocument) => {
						return await jsonLs.getSelectionRanges(document, positions, jsonDocument);
					});
				},

				provideDocumentFormattingEdits(document, range, options) {
					return worker(document, async () => {

						const options_2 = await context.env.getConfiguration?.<json.FormattingOptions & { enable: boolean; }>('json.format');
						if (!(options_2?.enable ?? true)) {
							return;
						}

						return jsonLs.format(document, range, {
							...options_2,
							...options,
						});
					});
				},
			};

			function worker<T>(document: TextDocument, callback: (jsonDocument: json.JSONDocument) => T) {

				const jsonDocument = getJsonDocument(document);
				if (!jsonDocument)
					return;

				return callback(jsonDocument);
			}

			function getJsonDocument(textDocument: TextDocument) {

				if (textDocument.languageId !== 'json' && textDocument.languageId !== 'jsonc')
					return;

				const cache = jsonDocuments.get(textDocument);
				if (cache) {
					const [cacheVersion, cacheDoc] = cache;
					if (cacheVersion === textDocument.version) {
						return cacheDoc;
					}
				}

				const doc = jsonLs.parseJSONDocument(textDocument);
				jsonDocuments.set(textDocument, [textDocument.version, doc]);

				return doc;
			}
		},
	};
}
