import type { Service } from '@volar/language-service';
import { format, resolveConfigFile, resolveConfig, type Options, type ResolveConfigOptions, getFileInfo } from 'prettier';

export default (
	options: {
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
		 * Do not use settings from VSCode's `editor.tabSize` and temporary tabSize on status bar
		 *
		 * @see https://github.com/volarjs/services/issues/5
		 */
		ignoreIdeOptions?: boolean,
		/**
		 * Additional options to pass to Prettier
		 * This is useful, for instance, to add specific plugins you need.
		 */
		additionalOptions?: (resolvedConfig: Options) => Options;
		/**
		 * Options to use when resolving the Prettier config
		 */
		resolveConfigOptions?: ResolveConfigOptions;
	} = {},
	getPrettierConfig = (config?: ResolveConfigOptions) => {
		const configFile = resolveConfigFile.sync();
		if (configFile) {
			return resolveConfig.sync(configFile, config) ?? {};
		}
		return {};
	},
): Service => (context): ReturnType<Service> => {

	if (!context) {
		return {};
	}

	const languages = options.languages ?? ['html', 'css', 'scss', 'typescript', 'javascript'];
	const filePrettierOptions = getPrettierConfig(options.resolveConfigOptions);

	return {
		async provideDocumentFormattingEdits(document, _, formatOptions) {
			if (!languages.includes(document.languageId)) {
				return;
			}

			const fileInfo = await getFileInfo(context.env.uriToFileName(document.uri), { ignorePath: '.prettierignore' });

			if (fileInfo.ignored) {
				return;
			}

			const editorPrettierOptions = await context.env.getConfiguration?.('prettier', document.uri);
			const ideFormattingOptions =
				formatOptions !== undefined && !options.ignoreIdeOptions // We need to check for options existing here because some editors might not have it
					? {
						tabWidth: formatOptions.tabSize,
						useTabs: !formatOptions.insertSpaces,
					}
					: {};

			const fullText = document.getText();
			let oldText = fullText;

			const isHTML = document.languageId === 'html';
			if (isHTML && options.html?.breakContentsFromTags) {
				oldText = oldText
					.replace(/(<[a-z][^>]*>)([^ \n])/gi, '$1 $2')
					.replace(/([^ \n])(<\/[a-z][a-z0-9\t\n\r -]*>)/gi, '$1 $2');
			}

			// Return a config with the following cascade:
			// - Prettier config file should always win if it exists, if it doesn't:
			// - Prettier config from the VS Code extension is used, if it doesn't exist:
			// - Use the editor's basic configuration settings
			const prettierOptions = returnObjectIfHasKeys(filePrettierOptions) || returnObjectIfHasKeys(editorPrettierOptions) || ideFormattingOptions;

			const currentPrettierConfig: Options = {
				...options.additionalOptions ? options.additionalOptions(prettierOptions) : prettierOptions,
				filepath: context.env.uriToFileName(document.uri),
			};

			if (!options.ignoreIdeOptions) {
				currentPrettierConfig.useTabs = !formatOptions.insertSpaces;
				currentPrettierConfig.tabWidth = formatOptions.tabSize;
			}

			return [{
				newText: format(oldText, currentPrettierConfig),
				range: {
					start: document.positionAt(0),
					end: document.positionAt(fullText.length),
				},
			}];
		},
	};
};

function returnObjectIfHasKeys<T>(obj: T | undefined): T | undefined {
	if (Object.keys(obj || {}).length > 0) {
		return obj;
	}
}
