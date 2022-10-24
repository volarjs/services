import type { LanguageServicePlugin } from '@volar/language-service';
import { format, resolveConfigFile, resolveConfig, Options } from 'prettier';
import { URI } from 'vscode-uri';

export interface VolarPrettierConfig {
	/**
	 * Languages to be formatted by prettier.
	 *
	 * @default
	 * ['html', 'css', 'scss', 'typescript', 'javascript']
	 */
	languages?: string[];
	html?: {
		/**
		 * Preprocessing to break "contents" from "HTML tags".
		 * This will prevent HTML closing tags, and opening tags without attributes
		 * from breaking into a blank `>` or `<` on a new line.
		 */
		breakContentsFromTags?: boolean;
	};
	/**
	 * Use settings from VSCode's `editor.tabSize` and temporary tabSize on status bar
	 *
	 * @see https://github.com/johnsoncodehk/volar-plugins/issues/5
	 */
	useVscodeIndentation?: boolean;
}

export const defaultConfig: VolarPrettierConfig = {
	languages: ['html', 'css', 'scss', 'typescript', 'javascript'],
};

function mapDefault<T>(o: T, d: T): T {
	for (const k in d) {
		if (typeof o[k] === 'undefined') {
			o[k] = d[k];
		}
		if (
			typeof d[k] === 'object' &&
			Object.getPrototypeOf(d[k]) === Object.prototype
		) {
			mapDefault(o[k], d[k]);
		}
	}

	return o;
}

export const volarPrettierPlugin: (
	config: VolarPrettierConfig
) => LanguageServicePlugin = (config = {}) => {
	mapDefault(config, defaultConfig);

	const prettierConfigFile = resolveConfigFile.sync();
	const prettierConfig =
		(prettierConfigFile ? resolveConfig.sync(prettierConfigFile) : null) || {};

	return {
		format(document, _, opts) {
			if (!config.languages || !config.languages.includes(document.languageId))
				return;

			const fullText = document.getText();
			let oldText = fullText;

			const isHTML = document.languageId === 'html';
			if (isHTML && config.html?.breakContentsFromTags) {
				oldText = oldText
					.replace(/(<[a-z][^>]*>)([^ \n])/gi, '$1 $2')
					.replace(/([^ \n])(<\/[a-z][a-z0-9\t\n\r -]*>)/gi, '$1 $2');
			}

			const currentPrettierConfig: Options = {
				...prettierConfig,
				filepath: URI.parse(document.uri).fsPath + (isHTML ? '.vue' : ''),
			};

			if (config.useVscodeIndentation) {
				currentPrettierConfig.useTabs =
					typeof opts.insertSpaces === 'boolean'
						? opts.insertSpaces
						: typeof opts.tabSize !== 'number';
				currentPrettierConfig.tabWidth = opts.tabSize;
			}

			let newText = format(oldText, currentPrettierConfig);

			newText = '\n' + newText.trim() + '\n';

			if (newText === oldText) return [];
			return [
				{
					range: {
						start: document.positionAt(0),
						end: document.positionAt(fullText.length),
					},
					newText: newText,
				},
			];
		},
	};
};

export default volarPrettierPlugin;
