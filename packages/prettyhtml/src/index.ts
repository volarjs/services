import type { LanguageServicePlugin } from '@volar/language-service';
import prettyhtml from '@starptech/prettyhtml';

export = (configs: NonNullable<Parameters<typeof prettyhtml>[1]>): LanguageServicePlugin => () => ({

	format(document, range, options) {

		if (document.languageId !== 'html')
			return;

		const oldRangeText = document.getText(range);
		const newRangeText = prettyhtml(oldRangeText, {
			...configs,
			tabWidth: options.tabSize,
			useTabs: !options.insertSpaces,
		}).contents;

		if (newRangeText === oldRangeText)
			return [];

		let newText = document.getText({
			start: document.positionAt(0),
			end: range.start,
		})
			+ newRangeText
			+ document.getText({
				start: range.end,
				end: document.positionAt(document.getText().length),
			});

		if (!newText.startsWith('\n')) {
			newText = '\n' + newText;
		}
		if (!newText.endsWith('\n')) {
			newText = newText + '\n';
		}
		if (options.initialIndent) {
			const baseIndent = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';
			newText = newText.split('\n')
				.map(line => line ? (baseIndent + line) : line)
				.join('\n');
		}

		return [{
			newText,
			range: {
				start: document.positionAt(0),
				end: document.positionAt(document.getText().length),
			},
		}];
	},
});
