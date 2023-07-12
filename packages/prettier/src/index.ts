import type { Service } from '@volar/language-service';
import { type Options, type ResolveConfigOptions } from 'prettier';

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
		ignoreIdeOptions?: boolean;
		/**
		 * Determine if IDE options should be used as a fallback if there's no Prettier specific settings in the workspace
		 */
		useIdeOptionsFallback?: boolean;
		/**
		 * Additional options to pass to Prettier
		 * This is useful, for instance, to add specific plugins you need.
		 */
		additionalOptions?: (resolvedConfig: Options) => Options | Promise<Options>;
		/**
		 * Options to use when resolving the Prettier config
		 */
		resolveConfigOptions?: ResolveConfigOptions;
		/**
		 * Prettier instance to use. If undefined, Prettier will be imported through a normal `import('prettier')`.
		 * This property is useful whenever you want to load a specific instance of Prettier (for instance, loading the Prettier version installed in the user's project)
		 */
		prettier?: typeof import('prettier') | undefined;
	} = {},
	getPrettierConfig = async (prettier: typeof import('prettier'), config?: ResolveConfigOptions) => {
		const configFile = await prettier.resolveConfigFile();
		if (configFile) {
			return await prettier.resolveConfig(configFile, config) ?? {};
		}
		return {};
	},
): Service => (context): ReturnType<Service> => {

	if (!context) {
		return {};
	}

	let prettier: typeof import('prettier');
	try {
		prettier = options.prettier ?? require('prettier');
	} catch (e) {
		throw new Error("Could not load Prettier: " + e);
	}
	const languages = options.languages ?? ['html', 'css', 'scss', 'typescript', 'javascript'];

	return {
		async provideDocumentFormattingEdits(document, _, formatOptions) {
			if (!languages.includes(document.languageId)) {
				return;
			}

			const filePrettierOptions = await getPrettierConfig(prettier, options.resolveConfigOptions);
			const fileInfo = await prettier.getFileInfo(context.env.uriToFileName(document.uri), { ignorePath: '.prettierignore' });

			if (fileInfo.ignored) {
				return;
			}

			const editorPrettierOptions = await context.env.getConfiguration?.('prettier', document.uri);
			const ideFormattingOptions =
				formatOptions !== undefined && options.useIdeOptionsFallback // We need to check for options existing here because some editors might not have it
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
				...options.additionalOptions ? await options.additionalOptions(prettierOptions) : prettierOptions,
				filepath: context.env.uriToFileName(document.uri),
			};

			if (!options.ignoreIdeOptions) {
				currentPrettierConfig.useTabs = !formatOptions.insertSpaces;
				currentPrettierConfig.tabWidth = formatOptions.tabSize;
			}

			return [{
				newText: await prettier.format(oldText, currentPrettierConfig),
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
