import type { ServicePluginInstance, ServicePlugin, DocumentSelector, TextDocument, ServiceContext } from '@volar/language-service';
import * as prettyhtml from '@starptech/prettyhtml';

export type FormattingOptions = Parameters<typeof prettyhtml>[1];

export function create({
	documentSelector = ['html'],
	isFormattingEnabled = async () => true,
	getFormattingOptions = async () => ({}),
}: {
	documentSelector?: DocumentSelector;
	isFormattingEnabled?(document: TextDocument, context: ServiceContext): Promise<boolean>;
	getFormattingOptions?(document: TextDocument, context: ServiceContext): Promise<FormattingOptions>;
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
