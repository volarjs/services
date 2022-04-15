import { EmbeddedLanguageServicePlugin } from '@volar/vue-language-service-types';
import * as prettyhtml from '@starptech/prettyhtml';

export = function (configs: NonNullable<Parameters<typeof prettyhtml>[1]>): EmbeddedLanguageServicePlugin {

	return {

		format(document, range, options) {

			if (document.languageId !== 'html')
				return;

			const oldText = document.getText(range);
			const newText = prettyhtml(oldText, {
				...configs,
				tabWidth: options.tabSize,
				useTabs: !options.insertSpaces,
			}).contents;

			if (newText === oldText)
				return [];

			return [{
				range: range,
				newText: newText,
			}];
		},
	}
}
