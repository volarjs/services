import type { FormattingOptions, LanguageServiceContext } from '@volar/language-service';
import type * as ts from 'typescript';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { getConfigTitle } from '../shared';

export async function getFormatCodeSettings(
	ctx: LanguageServiceContext,
	document: TextDocument,
	options: FormattingOptions | undefined,
): Promise<ts.FormatCodeSettings> {
	const config = await ctx.env.getConfiguration<any>?.(getConfigTitle(document) + '.format') ?? {};
	// The built-in TS extension reads the unified `js/ts.format.*` settings
	// first and only falls back to the deprecated language-specific
	// `typescript.format.*` / `javascript.format.*` settings when the unified
	// value is not configured. Mirror that behavior here.
	const unifiedConfig = await ctx.env.getConfiguration<any>?.('js/ts.format') ?? {};

	function formatOption(key: string, defaultValue: any): any {
		const unified = unifiedConfig[key];
		// `getConfiguration()` returns the registered default even for unset
		// settings, so we can only tell a user-configured unified value from an
		// unset one by comparing it against its default.
		return unified !== undefined && unified !== defaultValue
			? unified
			: config[key] ?? defaultValue;
	}

	return {
		convertTabsToSpaces: options?.insertSpaces,
		tabSize: options?.tabSize,
		indentSize: options?.tabSize,
		indentStyle: 2 satisfies ts.IndentStyle.Smart,
		newLineCharacter: '\n',
		insertSpaceAfterCommaDelimiter: formatOption('insertSpaceAfterCommaDelimiter', true),
		insertSpaceAfterConstructor: formatOption('insertSpaceAfterConstructor', false),
		insertSpaceAfterSemicolonInForStatements: formatOption('insertSpaceAfterSemicolonInForStatements', true),
		insertSpaceBeforeAndAfterBinaryOperators: formatOption('insertSpaceBeforeAndAfterBinaryOperators', true),
		insertSpaceAfterKeywordsInControlFlowStatements: formatOption(
			'insertSpaceAfterKeywordsInControlFlowStatements',
			true,
		),
		insertSpaceAfterFunctionKeywordForAnonymousFunctions: formatOption(
			'insertSpaceAfterFunctionKeywordForAnonymousFunctions',
			true,
		),
		insertSpaceBeforeFunctionParenthesis: formatOption('insertSpaceBeforeFunctionParenthesis', false),
		insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: formatOption(
			'insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis',
			false,
		),
		insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: formatOption(
			'insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets',
			false,
		),
		insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: formatOption(
			'insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces',
			true,
		),
		insertSpaceAfterOpeningAndBeforeClosingEmptyBraces: formatOption(
			'insertSpaceAfterOpeningAndBeforeClosingEmptyBraces',
			true,
		),
		insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: formatOption(
			'insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces',
			false,
		),
		insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces: formatOption(
			'insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces',
			false,
		),
		insertSpaceAfterTypeAssertion: formatOption('insertSpaceAfterTypeAssertion', false),
		placeOpenBraceOnNewLineForFunctions: formatOption('placeOpenBraceOnNewLineForFunctions', false),
		placeOpenBraceOnNewLineForControlBlocks: formatOption('placeOpenBraceOnNewLineForControlBlocks', false),
		semicolons: formatOption('semicolons', 'ignore'),
	};
}
