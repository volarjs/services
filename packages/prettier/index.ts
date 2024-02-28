import type { ServicePluginInstance, ServicePlugin, ServiceEnvironment } from '@volar/language-service';
import type { Options, ResolveConfigOptions } from 'prettier';
import { URI } from 'vscode-uri';

export function create(
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
		getPrettier?: (serviceEnv: ServiceEnvironment) => typeof import('prettier') | undefined,
		/**
		 * If true, the plugin will not throw an error if it can't load Prettier either through the `prettier`, or `getPrettier` properties or through a normal `import('prettier')`.
		 */
		allowImportError?: boolean;
	} = {},
	getPrettierConfig = async (filePath: string, prettier: typeof import('prettier'), config?: ResolveConfigOptions) => {
		return await prettier.resolveConfig(filePath, config) ?? {};
	},
): ServicePlugin {
	return {
		name: 'prettier',
		create(context): ServicePluginInstance {
			const languages = options.languages ?? ['html', 'css', 'scss', 'typescript', 'javascript'];

			let prettier: typeof import('prettier');
			try {
				prettier = options.prettier
					?? options.getPrettier?.(context.env)
					?? require('prettier');

				return {
					async provideDocumentFormattingEdits(document, _, formatOptions) {
						if (!prettier) return;
						if (!languages.includes(document.languageId)) {
							return;
						}

						const filePath = URI.parse(document.uri).fsPath;
						const fileInfo = await prettier.getFileInfo(filePath, { ignorePath: '.prettierignore', resolveConfig: false });

						if (fileInfo.ignored) {
							return;
						}

						const filePrettierOptions = await getPrettierConfig(
							filePath,
							prettier,
							options.resolveConfigOptions
						);

						const editorPrettierOptions = await context.env.getConfiguration?.('prettier', document.uri);
						const ideFormattingOptions =
							formatOptions !== undefined && options.useIdeOptionsFallback // We need to check for options existing here because some editors might not have it
								? {
									tabWidth: formatOptions.tabSize,
									useTabs: !formatOptions.insertSpaces,
								}
								: {};

						// Return a config with the following cascade:
						// - Prettier config file should always win if it exists, if it doesn't:
						// - Prettier config from the VS Code extension is used, if it doesn't exist:
						// - Use the editor's basic configuration settings
						const prettierOptions = returnObjectIfHasKeys(filePrettierOptions) || returnObjectIfHasKeys(editorPrettierOptions) || ideFormattingOptions;

						const currentPrettierConfig: Options = {
							...(options.additionalOptions
								? await options.additionalOptions(prettierOptions)
								: prettierOptions),
							filepath: filePath,
						};

						if (!options.ignoreIdeOptions) {
							currentPrettierConfig.useTabs = !formatOptions.insertSpaces;
							currentPrettierConfig.tabWidth = formatOptions.tabSize;
						}

						const fullText = document.getText();
						let oldText = fullText;

						const isHTML = document.languageId === "html";
						if (isHTML && options.html?.breakContentsFromTags) {
							oldText = oldText
								.replace(/(<[a-z][^>]*>)([^ \n])/gi, "$1 $2")
								.replace(/([^ \n])(<\/[a-z][a-z0-9\t\n\r -]*>)/gi, "$1 $2");
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
			} catch (e) {
				if (!options.allowImportError) throw new Error("Could not load Prettier: " + e);
			}

			return {};
		},
	};
}

function returnObjectIfHasKeys<T>(obj: T | undefined): T | undefined {
	if (Object.keys(obj || {}).length > 0) {
		return obj;
	}
}
