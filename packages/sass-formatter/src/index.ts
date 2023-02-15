import type { LanguageServicePlugin } from '@volar/language-service';
import { SassFormatter } from 'sass-formatter';

export = (configs: Parameters<typeof SassFormatter.Format>[1]): LanguageServicePlugin => () => ({

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

		let newText = SassFormatter.Format(document.getText(), _options);

		if (!newText.startsWith('\n')) {
			newText = '\n' + newText;
		}
		if (!newText.endsWith('\n')) {
			newText = newText + '\n';
		}

		return [{
			range: range,
			newText: newText,
		}];
	},
});
