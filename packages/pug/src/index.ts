import useHtmlPlugin from 'volar-service-html';
import type { Service, ServiceContext } from '@volar/language-service';
import { transformer } from '@volar/language-service';
import type * as html from 'vscode-html-languageservice';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as pug from './languageService';

export interface PluginInstance extends ReturnType<Service> {
	getHtmlLs: () => html.LanguageService;
	updateCustomData(extraData: html.IHTMLDataProvider[]): void;
	getPugLs: () => pug.LanguageService;
	getPugDocument: (document: TextDocument) => pug.PugDocument | undefined;
}

export default () => (context: ServiceContext | undefined): PluginInstance => {

	if (!context) {
		return {} as any;
	}

	const pugDocuments = new WeakMap<TextDocument, [number, pug.PugDocument]>();
	const htmlPlugin = useHtmlPlugin()(context);
	const pugLs = pug.getLanguageService(htmlPlugin.getHtmlLs());

	return {

		...htmlPlugin,
		getPugLs: () => pugLs,
		getPugDocument,

		resolveRuleContext(context) {
			worker(context.document, (pugDocument) => {
				if (pugDocument.ast) {
					context.pug = {
						rootNode: pugDocument.ast,
						languageService: pugLs,
					};
				}
			});
			return context;
		},

		provideCompletionItems(document, position, _) {
			return worker(document, (pugDocument) => {
				return pugLs.doComplete(pugDocument, position, context.env.documentContext, /** TODO: CompletionConfiguration */);
			});
		},

		provideDiagnostics(document) {
			return worker(document, (pugDocument) => {

				if (pugDocument.error) {

					return [{
						source: 'pug',
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
				if (context.env.documentContext) {
					return pugLs.findDocumentLinks(pugDocument, context.env.documentContext);
				}
			});
		},

		provideDocumentSymbols(document, token) {
			return worker(document, async (pugDoc) => {

				const htmlResult = await htmlPlugin.provideDocumentSymbols?.(pugDoc.map.virtualFileDocument, token) ?? [];
				const pugResult = htmlResult.map(htmlSymbol => transformer.asDocumentSymbol(
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
};
