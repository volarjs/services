import type { LanguageServicePlugin, LanguageServicePluginInstance } from '@volar/language-service';

export default (): LanguageServicePlugin => (): LanguageServicePluginInstance => ({

	provideDocumentFormattingEdits(document, range, options) {

		if (document.languageId !== 'jade')
			return;

		const pugCode = document.getText(range);

		// fix https://github.com/johnsoncodehk/volar/issues/304
		if (pugCode.trim() === '')
			return;

		const pugBeautify = require('@johnsoncodehk/pug-beautify');
		const prefixesLength = pugCode.length - pugCode.trimStart().length;
		const suffixesLength = pugCode.length - pugCode.trimEnd().length;
		const prefixes = pugCode.slice(0, prefixesLength);
		const suffixes = pugCode.slice(pugCode.length - suffixesLength);

		let newText: string = pugBeautify(pugCode, {
			tab_size: options.tabSize,
			fill_tab: !options.insertSpaces,
		});

		return [{
			range,
			newText: prefixes + newText.trim() + suffixes,
		}];
	},
});
