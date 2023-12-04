import { transformDocumentSymbol, type Diagnostic, type DiagnosticSeverity, type ServicePlugin, Service } from '@volar/language-service';
import { create as createHtmlService } from 'volar-service-html';
import type * as html from 'vscode-html-languageservice';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import * as pug from './languageService';

export interface Provide {
	'pug/pugDocument': (document: TextDocument) => pug.PugDocument | undefined;
	'pug/languageService': () => pug.LanguageService;
	'pug/updateCustomData': (extraData: html.IHTMLDataProvider[]) => void;
}

export function create(): ServicePlugin<Provide> {
	const _htmlService = createHtmlService();
	return {
		..._htmlService,
		create(context): Service<Provide> {

			const htmlService = _htmlService.create(context);
			const pugDocuments = new WeakMap<TextDocument, [number, pug.PugDocument]>();
			const pugLs = pug.getLanguageService(htmlService.provide['html/languageService']());

			return {
				...htmlService,

				provide: {
					'pug/pugDocument': getPugDocument,
					'pug/languageService': () => pugLs,
					'pug/updateCustomData': htmlService.provide['html/updateCustomData'],
				},

				provideCompletionItems(document, position, _) {
					return worker(document, (pugDocument) => {
						return pugLs.doComplete(pugDocument, position, htmlService.provide['html/documentContext'](), /** TODO: CompletionConfiguration */);
					});
				},

				provideDiagnostics(document) {
					return worker(document, (pugDocument): Diagnostic[] => {

						if (pugDocument.error) {

							return [{
								source: 'pug',
								severity: 1 satisfies typeof DiagnosticSeverity.Error,
								code: pugDocument.error.code,
								message: pugDocument.error.msg,
								range: {
									start: { line: pugDocument.error.line, character: pugDocument.error.column },
									end: { line: pugDocument.error.line, character: pugDocument.error.column },
								},
							}];
						}

						return [];
					});
				},

				provideHover(document, position) {
					return worker(document, async (pugDocument) => {

						const hoverSettings = await context.env.getConfiguration?.<html.HoverSettings>('html.hover');

						return pugLs.doHover(pugDocument, position, hoverSettings);
					});
				},

				provideDocumentHighlights(document, position) {
					return worker(document, (pugDocument) => {
						return pugLs.findDocumentHighlights(pugDocument, position);
					});
				},

				provideDocumentLinks(document) {
					return worker(document, (pugDocument) => {
						return pugLs.findDocumentLinks(pugDocument, htmlService.provide['html/documentContext']());
					});
				},

				provideDocumentSymbols(document, token) {
					return worker(document, async (pugDoc) => {

						const htmlResult = await htmlService.provideDocumentSymbols?.(pugDoc.map.virtualFileDocument, token) ?? [];
						const pugResult = htmlResult.map(htmlSymbol => transformDocumentSymbol(
							htmlSymbol,
							range => pugDoc.map.toSourceRange(range),
						)).filter((symbol): symbol is NonNullable<typeof symbol> => symbol !== undefined);

						return pugResult;
					});
				},

				provideFoldingRanges(document) {
					return worker(document, (pugDocument) => {
						return pugLs.getFoldingRanges(pugDocument);
					});
				},

				provideSelectionRanges(document, positions) {
					return worker(document, (pugDocument) => {
						return pugLs.getSelectionRanges(pugDocument, positions);
					});
				},

				async provideAutoInsertionEdit(document, position, insertContext) {
					return worker(document, async (pugDocument) => {

						const lastCharacter = insertContext.lastChange.text[insertContext.lastChange.text.length - 1];

						if (insertContext.lastChange.rangeLength === 0 && lastCharacter === '=') {

							const enabled = (await context.env.getConfiguration?.<boolean>('html.autoCreateQuotes')) ?? true;

							if (enabled) {

								const text = pugLs.doQuoteComplete(pugDocument, position, await context.env.getConfiguration?.<html.CompletionConfiguration>('html.completion'));

								if (text) {
									return text;
								}
							}
						}
					});
				},
			};

			function worker<T>(document: TextDocument, callback: (pugDocument: pug.PugDocument) => T) {

				const pugDocument = getPugDocument(document);
				if (!pugDocument)
					return;

				return callback(pugDocument);
			}

			function getPugDocument(document: TextDocument) {

				if (document.languageId !== 'jade')
					return;

				const cache = pugDocuments.get(document);
				if (cache) {
					const [cacheVersion, cacheDoc] = cache;
					if (cacheVersion === document.version) {
						return cacheDoc;
					}
				}

				const doc = pugLs.parsePugDocument(document.getText());
				pugDocuments.set(document, [document.version, doc]);

				return doc;
			}
		},
	};
}
