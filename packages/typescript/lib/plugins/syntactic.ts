import type {
	ProviderResult,
	ServiceContext,
	LanguageServicePlugin,
	LanguageServicePluginInstance
} from '@volar/language-service';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { getFormatCodeSettings } from '../configs/getFormatCodeSettings';
import { getConfigTitle, isTsDocument, safeCall } from '../shared';
import {
	convertNavTree,
	convertOutliningSpan,
	convertTextChange
} from '../utils/lspConverters';
import { getLanguageService } from '../syntacticLanguageService';

export function create(
	ts: typeof import('typescript'),
	{
		isFormattingEnabled = async (document, context) => {
			return await context.env.getConfiguration?.<boolean>(getConfigTitle(document) + '.format.enable') ?? true;
		},
		isAutoClosingTagsEnabled = async (document, context) => {
			return await context.env.getConfiguration?.<boolean>(getConfigTitle(document) + '.autoClosingTags') ?? true;
		},
	}: {
		isFormattingEnabled?(document: TextDocument, context: ServiceContext): ProviderResult<boolean>;
		isAutoClosingTagsEnabled?(document: TextDocument, context: ServiceContext): ProviderResult<boolean>;
	} = {},
): LanguageServicePlugin {
	return {
		name: 'typescript-syntactic',
		// https://github.com/microsoft/vscode/blob/ce119308e8fd4cd3f992d42b297588e7abe33a0c/extensions/typescript-language-features/src/languageFeatures/formatting.ts#L99
		autoFormatTriggerCharacters: [';', '}', '\n'],
		create(context): LanguageServicePluginInstance {

			return {

				async provideAutoInsertionEdit(document, position, lastChange) {
					if (
						(document.languageId === 'javascriptreact' || document.languageId === 'typescriptreact')
						&& lastChange.text.endsWith('>')
						&& await isAutoClosingTagsEnabled(document, context)
					) {
						const { languageService, fileName } = getLanguageService(ts, document);
						const close = languageService.getJsxClosingTagAtPosition(fileName, document.offsetAt(position));
						if (close) {
							return '$0' + close.newText;
						}
					}
				},

				provideFoldingRanges(document) {

					if (!isTsDocument(document)) {
						return;
					}

					const { languageService, fileName } = getLanguageService(ts, document);
					const outliningSpans = safeCall(() => languageService.getOutliningSpans(fileName));
					if (!outliningSpans) {
						return [];
					}
					return outliningSpans.map(span => convertOutliningSpan(span, document));
				},

				provideDocumentSymbols(document) {

					if (!isTsDocument(document)) {
						return;
					}

					const { languageService, fileName } = getLanguageService(ts, document);
					const barItems = safeCall(() => languageService.getNavigationTree(fileName));
					if (!barItems) {
						return [];
					}

					// The root represents the file. Ignore this when showing in the UI
					return barItems.childItems
						?.map(item => convertNavTree(item, document))
						.flat()
						?? [];
				},

				async provideDocumentFormattingEdits(document, range, options, codeOptions) {

					if (!isTsDocument(document)) {
						return;
					}

					if (!await isFormattingEnabled(document, context)) {
						return;
					}

					const tsOptions = await getFormatCodeSettings(context, document, options);
					if (codeOptions) {
						tsOptions.baseIndentSize = codeOptions.initialIndentLevel * options.tabSize;
					}
					const { languageService, fileName } = getLanguageService(ts, document);
					const scriptEdits = range
						? safeCall(() => languageService.getFormattingEditsForRange(
							fileName,
							document.offsetAt(range.start),
							document.offsetAt(range.end),
							tsOptions,
						))
						: safeCall(() => languageService.getFormattingEditsForDocument(fileName, tsOptions));
					if (!scriptEdits) {
						return [];
					}
					return scriptEdits.map(edit => convertTextChange(edit, document));
				},

				async provideOnTypeFormattingEdits(document, position, key, options, codeOptions) {

					if (!isTsDocument(document)) {
						return;
					}

					if (!await isFormattingEnabled(document, context)) {
						return;
					}

					const tsOptions = await getFormatCodeSettings(context, document, options);
					if (codeOptions) {
						tsOptions.baseIndentSize = codeOptions.initialIndentLevel * options.tabSize;
					}
					const { languageService, fileName } = getLanguageService(ts, document);
					const scriptEdits = safeCall(() => languageService.getFormattingEditsAfterKeystroke(fileName, document.offsetAt(position), key, tsOptions));
					if (!scriptEdits) {
						return [];
					}
					return scriptEdits.map(edit => convertTextChange(edit, document));
				},
			};
		},
	};
}
