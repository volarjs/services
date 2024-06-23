import type {
	LanguageServiceContext,
	LanguageServicePlugin,
	LanguageServicePluginInstance,
	ProviderResult
} from '@volar/language-service';
import type * as ts from 'typescript';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { getFormatCodeSettings } from '../configs/getFormatCodeSettings';
import { getConfigTitle, isTsDocument, safeCall } from '../shared';
import { createSyntaxOnlyService } from '../syntaxOnlyService';
import {
	convertNavTree,
	convertOutliningSpan,
	convertSelectionRange,
	convertTextChange
} from '../utils/lspConverters';

const snapshots = new WeakMap<TextDocument, [number, ts.IScriptSnapshot]>();

let created: ReturnType<typeof createSyntaxOnlyService> | undefined;

export function getLanguageServiceByDocument(ts: typeof import('typescript'), document: TextDocument) {
	if (!created) {
		created = createSyntaxOnlyService(ts, true);
	}
	let cache = snapshots.get(document);
	if (!cache || cache[0] !== document.version) {
		const snapshot = ts.ScriptSnapshot.fromString(document.getText());
		cache = [document.version, snapshot];
		snapshots.set(document, cache);
		created.updateFile(
			document.uri,
			cache[1],
			document.languageId === 'javascript'
				? ts.ScriptKind.JS
				: document.languageId === 'javascriptreact'
					? ts.ScriptKind.JSX
					: document.languageId === 'typescriptreact'
						? ts.ScriptKind.TSX
						: ts.ScriptKind.TS
		);
	}
	return {
		languageService: created.languageService,
		fileName: document.uri,
	};
}

export function create(
	ts: typeof import('typescript'),
	{
		isFormattingEnabled = async (document, context) => {
			return await context.env.getConfiguration?.<boolean>(getConfigTitle(document) + '.format.enable') ?? true;
		},
	}: {
		isFormattingEnabled?(document: TextDocument, context: LanguageServiceContext): ProviderResult<boolean>;
		isAutoClosingTagsEnabled?(document: TextDocument, context: LanguageServiceContext): ProviderResult<boolean>;
	} = {}
): LanguageServicePlugin {
	return {
		name: 'typescript-syntactic',
		capabilities: {
			autoInsertionProvider: {
				triggerCharacters: ['>', '>'],
				configurationSections: ['javascript.autoClosingTags', 'typescript.autoClosingTags'],
			},
			foldingRangeProvider: true,
			selectionRangeProvider: true,
			documentSymbolProvider: true,
			documentFormattingProvider: true,
			documentOnTypeFormattingProvider: {
				// https://github.com/microsoft/vscode/blob/ce119308e8fd4cd3f992d42b297588e7abe33a0c/extensions/typescript-language-features/src/languageFeatures/formatting.ts#L99
				triggerCharacters: [';', '}', '\n'],
			},
		},
		create(context): LanguageServicePluginInstance {

			return {

				async provideAutoInsertSnippet(document, selection, change) {
					// selection must at end of change
					if (document.offsetAt(selection) !== change.rangeOffset + change.text.length) {
						return;
					}
					if (
						(document.languageId === 'javascriptreact' || document.languageId === 'typescriptreact')
						&& change.text.endsWith('>')
						&& (await context.env.getConfiguration?.<boolean>(getConfigTitle(document) + '.autoClosingTags') ?? true)
					) {
						const { languageService, fileName } = getLanguageServiceByDocument(ts, document);
						const close = languageService.getJsxClosingTagAtPosition(fileName, document.offsetAt(selection));
						if (close) {
							return '$0' + close.newText;
						}
					}
				},

				provideFoldingRanges(document) {

					if (!isTsDocument(document)) {
						return;
					}

					const { languageService, fileName } = getLanguageServiceByDocument(ts, document);
					const outliningSpans = safeCall(() => languageService.getOutliningSpans(fileName));
					if (!outliningSpans) {
						return [];
					}
					return outliningSpans.map(span => convertOutliningSpan(span, document));
				},

				provideSelectionRanges(document, positions) {

					if (!isTsDocument(document)) {
						return;
					}

					const { languageService, fileName } = getLanguageServiceByDocument(ts, document);
					const ranges = positions
						.map(position => {
							const offset = document.offsetAt(position);
							const range = safeCall(() => languageService.getSmartSelectionRange(fileName, offset));
							if (!range) {
								return;
							}
							return convertSelectionRange(range, document);
						});
					if (ranges.every(range => !!range)) {
						return ranges;
					}
				},

				provideDocumentSymbols(document) {

					if (!isTsDocument(document)) {
						return;
					}

					const { languageService, fileName } = getLanguageServiceByDocument(ts, document);
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
					const { languageService, fileName } = getLanguageServiceByDocument(ts, document);
					const scriptEdits = range
						? safeCall(() => languageService.getFormattingEditsForRange(
							fileName,
							document.offsetAt(range.start),
							document.offsetAt(range.end),
							tsOptions
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
					const { languageService, fileName } = getLanguageServiceByDocument(ts, document);
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
