import type { EmbeddedLanguageServicePlugin } from '@volar/vue-language-service-types';
import * as prettier from 'prettier';
import { URI } from 'vscode-uri';

export default function (configs: {
	languages: string[],
}): EmbeddedLanguageServicePlugin {

	return {

		format(document, range, options) {

			if (!configs.languages.includes(document.languageId))
				return;

			const oldText = document.getText(range);
			const newText = prettier.format(oldText, {
				tabWidth: options.tabSize,
				useTabs: !options.insertSpaces,
				filepath: URI.parse(document.uri).fsPath,
			});

			if (newText === oldText)
				return [];

			return [{
				range: range,
				newText: newText,
			}];
		},
	}
}
