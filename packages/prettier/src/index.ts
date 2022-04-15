import type { EmbeddedLanguageServicePlugin } from '@volar/vue-language-service-types';
import { format, resolveConfigFile, resolveConfig } from 'prettier';
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
) => EmbeddedLanguageServicePlugin = (config = {}) => {
	mapDefault(config, defaultConfig);

	const prettierConfigFile = resolveConfigFile.sync();
	const prettierConfig =
		(prettierConfigFile ? resolveConfig.sync(prettierConfigFile) : null) || {};

	return {
		format(document, range, _options) {
			if (!config.languages || !config.languages.includes(document.languageId))
				return;

			let oldText = document.getText(range);

			const isHTML = document.languageId === 'html';
			if (isHTML && config.html?.breakContentsFromTags) {
				oldText = oldText
					.replace(/(<[a-z][^>]*>)([^ \n])/gi, '$1 $2')
					.replace(/([^ \n])(<\/[a-z][a-z0-9\t\n\r -]*>)/gi, '$1 $2');
			}

			let newText = format(oldText, {
				...prettierConfig,
				filepath: URI.parse(document.uri).fsPath + (isHTML ? '.vue' : ''),
			});

			newText = '\n' + newText.trim() + '\n';

			if (newText === oldText) return [];
			return [
				{
					range: range,
					newText: newText,
				},
			];
		},
	};
};

export default volarPrettierPlugin;
