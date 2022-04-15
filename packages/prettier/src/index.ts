import { randomUUID } from 'crypto';

import type { EmbeddedLanguageServicePlugin } from '@volar/vue-language-service-types';
import { format, resolveConfigFile, resolveConfig, Options } from 'prettier';
import { URI } from 'vscode-uri';
import { writeFileSync } from 'fs';

export interface VolarPrettierConfig {
	/**
	 * Languages to be formatted by prettier.
	 *
	 * @default
	 * ['html', 'css', 'scss', 'less', 'typescript', 'javascript']
	 */
	languages?: string[];
	html?: {
		/**
		 * Prettier breaks {{'...long line...'}} in <template> tags.
		 * This should work as a temporary fix.
		 *
		 * @default
		 * true
		 */
		keepLongTemplates?: boolean;
		/**
		 * An opinionated option of breaking "contents" from "HTML tags".
		 * This will probably prevent HTML closing tags, and opening tags without attributes
		 * from breaking into blank `>` on a new line.
		 *
		 * @default
		 * false
		 */
		breakContentsFromTags?: boolean;
	};
}

export const defaultConfig: VolarPrettierConfig = {
	languages: ['html', 'css', 'scss', 'less', 'typescript', 'javascript'],
	html: {
		keepLongTemplates: true,
		breakContentsFromTags: false,
	},
};

function mapDefault<T>(o: T, d: T): T {
	Object.keys(d).map((k) => {
		if (typeof o[k] === 'undefined') {
			o[k] = d[k];
		}
		if (d[k] instanceof Object) {
			mapDefault(o[k], d[k]);
		}
	});
	return o;
}

export const volarPrettierPlugin: (
	config: VolarPrettierConfig
) => EmbeddedLanguageServicePlugin = (config = {}) => {
	mapDefault(config, defaultConfig);

	let prettierConfig: Options = {};
	try {
		prettierConfig = resolveConfig.sync(resolveConfigFile.sync());
	} catch (e) {}

	const makeUUID = () => `{{'${randomUUID()}'}}`;
	const uuidRegex = (() => {
		const c = '[0-9a-f]';
		return new RegExp(makeUUID().replace(new RegExp(c, 'g'), c), 'g');
	})();

	return {
		format(document, range, options) {
			if (!config.languages.includes(document.languageId)) return;

			let oldText = document.getText(range);

			const isHTML = document.languageId === 'html';
			const isKeepLongHTMLTemplates = isHTML
				? config.html?.keepLongTemplates
				: false;
			const noBreak = new Map();
			if (isKeepLongHTMLTemplates) {
				oldText = oldText.replace(
					/( *){{ *((['"])[^]+?\3) *}}( *)/g,
					(raw, w1, content, _bracket, w2) => {
						const id = makeUUID();
						raw = `{{ ${content} }}`;
						noBreak.set(id, raw);
						return w1 + id + w2;
					}
				);
			}

			if (isHTML && config.html.breakContentsFromTags) {
				oldText = oldText
					.replace(/(<[a-z][^>]*>) ?(.)/gi, '$1 $2')
					.replace(/(.) ?(<\/[a-z][a-z0-9\t\n\r -]*>)/gi, '$1 $2');
			}

			let newText = format(oldText, {
				...prettierConfig,
				filepath: URI.parse(document.uri).fsPath,
			});

			if (isKeepLongHTMLTemplates) {
				newText = newText.replace(uuidRegex, (raw) => {
					return noBreak.get(raw) || raw;
				});
			}

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
