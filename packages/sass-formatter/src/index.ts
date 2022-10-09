import type { LanguageServicePlugin } from '@volar/language-service';
import { SassFormatter } from 'sass-formatter';

export = function (configs: Parameters<typeof SassFormatter.Format>[1]): LanguageServicePlugin {

	return {

		format(document, range, options) {

			if (document.languageId !== 'sass')
				return;

			const _options: typeof configs = {
				...configs,
				insertSpaces: options.insertSpaces,
			};

			// don't set when options.insertSpaces is false to avoid sass-formatter internal judge bug
			if (options.insertSpaces)
				_options.tabSize = options.tabSize;

			const oldText = document.getText(range);
			const newText = SassFormatter.Format(oldText, _options);

			if (newText === oldText)
				return [];

			return [{
				range: range,
				newText: newText,
			}];
		},
	}
}
