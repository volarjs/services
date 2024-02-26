import * as prettyhtml from '@starptech/prettyhtml';
import type { DocumentSelector, Result, ServiceContext, ServicePlugin, ServicePluginInstance, TextDocument } from '@volar/language-service';

export type FormattingOptions = Parameters<typeof prettyhtml>[1];

export function create({
	documentSelector = ['html'],
	isFormattingEnabled = () => true,
	getFormattingOptions = () => ({}),
}: {
	documentSelector?: DocumentSelector;
	isFormattingEnabled?(document: TextDocument, context: ServiceContext): Result<boolean>;
	getFormattingOptions?(document: TextDocument, context: ServiceContext): Result<FormattingOptions>;
} = {}): ServicePlugin {
	return {
		name: 'prettyhtml',
		create(context): ServicePluginInstance {
			return {
				async provideDocumentFormattingEdits(document, range, options) {

					if (!matchDocument(documentSelector, document))
						return;

					if (!await isFormattingEnabled(document, context))
						return;

					const oldRangeText = document.getText(range);
					const newRangeText = prettyhtml(oldRangeText, {
						tabWidth: options.tabSize,
						useTabs: !options.insertSpaces,
						...await getFormattingOptions(document, context),
					}).contents;

					if (newRangeText === oldRangeText)
						return [];

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
