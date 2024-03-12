import type { DocumentSelector, FormattingOptions, Result, ServiceContext, ServicePlugin, ServicePluginInstance, TextDocument } from '@volar/language-service';
import type { Options } from 'prettier';
import { URI } from 'vscode-uri';

export function create(
	/**
	 * Prettier instance or getter to use.
	 */
	prettierInstanceOrGetter: typeof import('prettier') | ((context: ServiceContext) => typeof import('prettier') | undefined),
	{
		html,
		documentSelector = ['html', 'css', 'scss', 'typescript', 'javascript'],
		isFormattingEnabled = async (prettier, document) => {
			const uri = URI.parse(document.uri);
			if (uri.scheme === 'file') {
				const fileInfo = await prettier.getFileInfo(uri.fsPath, { ignorePath: '.prettierignore', resolveConfig: false });
				if (fileInfo.ignored) {
					return false;
				}
			}
			return true;
		},
		getFormattingOptions = async (prettier, document, formatOptions, context) => {
			const filepath = URI.parse(document.uri).fsPath;
			const configOptions = await prettier.resolveConfig(filepath);
			const editorOptions = await context.env.getConfiguration<Options>?.('prettier', document.uri);
			return {
				filepath,
				tabWidth: formatOptions.tabSize,
				useTabs: !formatOptions.insertSpaces,
				...editorOptions,
				...configOptions,
			};
		},
	}: {
		html?: {
			/**
			 * Preprocessing to break "contents" from "HTML tags".
			 * This will prevent HTML closing tags, and opening tags without attributes
			 * from breaking into a blank `>` or `<` on a new line.
			 */
			breakContentsFromTags?: boolean;
		};
		/**
		 * Languages to be formatted by prettier.
		 *
		 * @default
		 * ['html', 'css', 'scss', 'typescript', 'javascript']
		 */
		documentSelector?: DocumentSelector;
		isFormattingEnabled?(prettier: typeof import('prettier'), document: TextDocument, context: ServiceContext): Result<boolean>;
		getFormattingOptions?(prettier: typeof import('prettier'), document: TextDocument, formatOptions: FormattingOptions, context: ServiceContext): Result<Options>;
	} = {},
): ServicePlugin {
	return {
		name: 'prettier',
		create(context): ServicePluginInstance {

			const prettier = typeof prettierInstanceOrGetter === 'function'
				? prettierInstanceOrGetter(context)
				: prettierInstanceOrGetter;

			if (!prettier) {
				return {};
			}

			return {
				async provideDocumentFormattingEdits(document, _, formatOptions) {
					if (!matchDocument(documentSelector, document)) {
						return;
					}

					if (!isFormattingEnabled(prettier, document, context)) {
						return;
					}

					const fullText = document.getText();
					let oldText = fullText;

					const isHTML = document.languageId === 'html';
					if (isHTML && html?.breakContentsFromTags) {
						oldText = oldText
							.replace(/(<[a-z][^>]*>)([^ \n])/gi, '$1 $2')
							.replace(/([^ \n])(<\/[a-z][a-z0-9\t\n\r -]*>)/gi, '$1 $2');
					}

					const prettierOptions = await getFormattingOptions(prettier, document, formatOptions, context);
					const newText = await prettier.format(oldText, prettierOptions);

					return [{
						newText,
						range: {
							start: document.positionAt(0),
							end: document.positionAt(fullText.length),
						},
					}];
				},
			};
		},
	};
}

function matchDocument(selector: DocumentSelector, document: { languageId: string; }) {
	for (const sel of selector) {
		if (sel === document.languageId || (typeof sel === 'object' && sel.language === document.languageId)) {
			return true;
		}
	}
	return false;
}
