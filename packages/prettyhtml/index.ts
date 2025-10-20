import * as prettyhtml from '@starptech/prettyhtml';
import type {
	DocumentSelector,
	FormattingOptions,
	LanguageServiceContext,
	LanguageServicePlugin,
	LanguageServicePluginInstance,
	ProviderResult,
	TextDocument,
} from '@volar/language-service';

export type PrettyhtmlFormattingOptions = Parameters<typeof prettyhtml>[1];

export function create({
	documentSelector = ['html'],
	isFormattingEnabled = () => true,
	getFormattingOptions = (_document, options) => {
		return {
			tabWidth: options.tabSize,
			useTabs: !options.insertSpaces,
		};
	},
}: {
	documentSelector?: DocumentSelector;
	isFormattingEnabled?(document: TextDocument, context: LanguageServiceContext): ProviderResult<boolean>;
	getFormattingOptions?(
		document: TextDocument,
		options: FormattingOptions,
		context: LanguageServiceContext,
	): ProviderResult<PrettyhtmlFormattingOptions>;
} = {}): LanguageServicePlugin {
	return {
		name: 'prettyhtml',
		capabilities: {
			documentFormattingProvider: true,
		},
		create(context): LanguageServicePluginInstance {
			return {
				async provideDocumentFormattingEdits(document, range, options) {
					if (!matchDocument(documentSelector, document)) {
						return;
					}

					if (!await isFormattingEnabled(document, context)) {
						return;
					}

					const oldRangeText = document.getText(range);
					const newRangeText = prettyhtml(
						oldRangeText,
						await getFormattingOptions(document, options, context),
					).contents;

					if (newRangeText === oldRangeText) {
						return [];
					}

					const newText = document.getText({
						start: document.positionAt(0),
						end: range.start,
					})
						+ newRangeText
						+ document.getText({
							start: range.end,
							end: document.positionAt(document.getText().length),
						});

					return [{
						newText,
						range: {
							start: document.positionAt(0),
							end: document.positionAt(document.getText().length),
						},
					}];
				},
			};
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
