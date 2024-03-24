import type { DocumentSelector, FormattingOptions, ProviderResult, ServiceContext, LanguageServicePlugin, LanguageServicePluginInstance, TextDocument } from '@volar/language-service';

export function create({
	documentSelector = ['jade'],
	isFormattingEnabled = () => true,
	getFormattingOptions = (_document, options) => {
		return {
			tab_size: options.tabSize,
			fill_tab: !options.insertSpaces,
		};
	},
}: {
	documentSelector?: DocumentSelector;
	isFormattingEnabled?(document: TextDocument, context: ServiceContext): ProviderResult<boolean>;
	getFormattingOptions?(document: TextDocument, options: FormattingOptions, context: ServiceContext): ProviderResult<{}>;
} = {}): LanguageServicePlugin {
	return {
		name: 'pug-beautify',
		create(context): LanguageServicePluginInstance {
			return {
				async provideDocumentFormattingEdits(document, range, options) {

					if (!matchDocument(documentSelector, document)) {
						return;
					}

					if (!await isFormattingEnabled(document, context)) {
						return;
					}

					const pugCode = document.getText(range);
					// fix https://github.com/johnsoncodehk/volar/issues/304
					if (pugCode.trim() === '') {
						return;
					}

					const pugBeautify = require('@johnsoncodehk/pug-beautify');
					const prefixesLength = pugCode.length - pugCode.trimStart().length;
					const suffixesLength = pugCode.length - pugCode.trimEnd().length;
					const prefixes = pugCode.slice(0, prefixesLength);
					const suffixes = pugCode.slice(pugCode.length - suffixesLength);
					const formatOptions = await getFormattingOptions(document, options, context);
					const newText: string = pugBeautify(pugCode, formatOptions);

					return [{
						range,
						newText: prefixes + newText.trim() + suffixes,
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
