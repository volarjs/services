import type { Diagnostic, DiagnosticSeverity, Disposable, DocumentSelector, LanguageServiceContext, LanguageServicePlugin, LanguageServicePluginInstance, ProviderResult } from '@volar/language-service';
import { transformDocumentSymbol } from '@volar/language-service';
import { getSourceRange } from '@volar/language-service/lib/utils/featureWorkers';
import { create as createHtmlService } from 'volar-service-html';
import type * as html from 'vscode-html-languageservice';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import * as pug from './lib/languageService';

export interface Provide {
	'pug/pugDocument': (document: TextDocument) => pug.PugDocument | undefined;
	'pug/languageService': () => pug.LanguageService;
}

export function create({
	documentSelector = ['jade'],
	configurationSections = {
		autoCreateQuotes: 'html.autoCreateQuotes',
	},
	useDefaultDataProvider = true,
	getCustomData,
	onDidChangeCustomData,
}: {
	documentSelector?: DocumentSelector;
	configurationSections?: {
		autoCreateQuotes: string;
	};
	useDefaultDataProvider?: boolean;
	getCustomData?(context: LanguageServiceContext): ProviderResult<html.IHTMLDataProvider[]>;
	onDidChangeCustomData?(listener: () => void, context: LanguageServiceContext): Disposable;
} = {}): LanguageServicePlugin {
	const _htmlService = createHtmlService({
		useDefaultDataProvider,
		getCustomData,
		onDidChangeCustomData,
	});
	return {
		name: 'pug',
		capabilities: {
			completionProvider: {
				triggerCharacters: ['.', ':'],
			},
			diagnosticProvider: {
				interFileDependencies: false,
				workspaceDiagnostics: false,
			},
			hoverProvider: true,
			documentHighlightProvider: true,
			documentLinkProvider: {},
			documentSymbolProvider: true,
			foldingRangeProvider: true,
			selectionRangeProvider: true,
			autoInsertionProvider: {
				triggerCharacters: ['='],
				configurationSections: [configurationSections.autoCreateQuotes],
			},
		},
		create(context): LanguageServicePluginInstance<Provide> {

			const htmlService = _htmlService.create(context);
			const pugDocuments = new WeakMap<TextDocument, [number, pug.PugDocument]>();
			const htmlLs: html.LanguageService = htmlService.provide['html/languageService']();
			const pugLs = pug.getLanguageService(htmlLs);
			const disposable = onDidChangeCustomData?.(() => initializing = undefined, context);

			let initializing: Promise<void> | undefined;

			return {
				dispose() {
					htmlService.dispose?.();
					disposable?.dispose();
				},
				provide: {
					'pug/pugDocument': getPugDocument,
					'pug/languageService': () => pugLs,
				},

				provideCompletionItems(document, position) {
					return worker(document, pugDocument => {
						return pugLs.doComplete(pugDocument, position, context, htmlService.provide['html/documentContext']() /** TODO: CompletionConfiguration */);
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
					return worker(document, async pugDocument => {

						const hoverSettings = await context.env.getConfiguration?.<html.HoverSettings>('html.hover');

						return pugLs.doHover(pugDocument, position, hoverSettings);
					});
				},

				provideDocumentHighlights(document, position) {
					return worker(document, pugDocument => {
						return pugLs.findDocumentHighlights(pugDocument, position);
					});
				},

				provideDocumentLinks(document) {
					return worker(document, pugDocument => {
						return pugLs.findDocumentLinks(pugDocument, htmlService.provide['html/documentContext']());
					});
				},

				provideDocumentSymbols(document, token) {
					return worker(document, async pugDoc => {

						const htmlResult = await htmlService.provideDocumentSymbols?.(pugDoc.docs[1], token) ?? [];
						const pugResult = htmlResult.map(htmlSymbol => transformDocumentSymbol(
							htmlSymbol,
							range => getSourceRange(pugDoc.docs, range)
						)).filter((symbol): symbol is NonNullable<typeof symbol> => symbol !== undefined);

						return pugResult;
					});
				},

				provideFoldingRanges(document) {
					return worker(document, pugDocument => {
						return pugLs.getFoldingRanges(pugDocument);
					});
				},

				provideSelectionRanges(document, positions) {
					return worker(document, pugDocument => {
						return pugLs.getSelectionRanges(pugDocument, positions);
					});
				},

				provideAutoInsertSnippet(document, selection, change) {
					// selection must at end of change
					if (document.offsetAt(selection) !== change.rangeOffset + change.text.length) {
						return;
					}
					return worker(document, async pugDocument => {
						if (change.rangeLength === 0 && change.text.endsWith('=')) {

							const enabled = (await context.env.getConfiguration?.<boolean>(configurationSections.autoCreateQuotes)) ?? true;

							if (enabled) {

								const text = pugLs.doQuoteComplete(pugDocument, selection, await context.env.getConfiguration?.<html.CompletionConfiguration>('html.completion'));

								if (text) {
									return text;
								}
							}
						}
					});
				},
			};

			async function worker<T>(document: TextDocument, callback: (pugDocument: pug.PugDocument) => T): Promise<Awaited<T> | undefined> {

				const pugDocument = getPugDocument(document);
				if (!pugDocument) {
					return;
				}

				await (initializing ??= initialize());

				return await callback(pugDocument);
			}

			async function initialize() {
				if (!getCustomData) {
					return;
				}
				const customData = await getCustomData(context);
				htmlLs.setDataProviders(useDefaultDataProvider, customData);
			}

			function getPugDocument(document: TextDocument) {

				if (!matchDocument(documentSelector, document)) {
					return;
				}

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

function matchDocument(selector: DocumentSelector, document: TextDocument) {
	for (const sel of selector) {
		if (sel === document.languageId || (typeof sel === 'object' && sel.language === document.languageId)) {
			return true;
		}
	}
	return false;
}
