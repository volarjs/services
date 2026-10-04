import type { FormattingOptions, LanguageServiceContext } from '@volar/language-service';
import type * as ts from 'typescript';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { createUnifiedConfig } from './getUnifiedConfig';

export async function getFormatCodeSettings(
	ctx: LanguageServiceContext,
	document: TextDocument,
	options: FormattingOptions | undefined,
): Promise<ts.FormatCodeSettings> {
	const config = await createUnifiedConfig(ctx, document);

	return {
		convertTabsToSpaces: options?.insertSpaces,
		tabSize: options?.tabSize,
		indentSize: options?.tabSize,
		indentStyle: 2 satisfies ts.IndentStyle.Smart,
		newLineCharacter: '\n',
		insertSpaceAfterCommaDelimiter: config.get('format.insertSpaceAfterCommaDelimiter', true),
		insertSpaceAfterConstructor: config.get('format.insertSpaceAfterConstructor', false),
		insertSpaceAfterSemicolonInForStatements: config.get('format.insertSpaceAfterSemicolonInForStatements', true),
		insertSpaceBeforeAndAfterBinaryOperators: config.get('format.insertSpaceBeforeAndAfterBinaryOperators', true),
		insertSpaceAfterKeywordsInControlFlowStatements: config.get(
			'format.insertSpaceAfterKeywordsInControlFlowStatements',
			true,
		),
		insertSpaceAfterFunctionKeywordForAnonymousFunctions: config.get(
			'format.insertSpaceAfterFunctionKeywordForAnonymousFunctions',
			true,
		),
		insertSpaceBeforeFunctionParenthesis: config.get('format.insertSpaceBeforeFunctionParenthesis', false),
		insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: config.get(
			'format.insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis',
			false,
		),
		insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: config.get(
			'format.insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets',
			false,
		),
		insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: config.get(
			'format.insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces',
			true,
		),
		insertSpaceAfterOpeningAndBeforeClosingEmptyBraces: config.get(
			'format.insertSpaceAfterOpeningAndBeforeClosingEmptyBraces',
			true,
		),
		insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: config.get(
			'format.insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces',
			false,
		),
		insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces: config.get(
			'format.insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces',
			false,
		),
		insertSpaceAfterTypeAssertion: config.get('format.insertSpaceAfterTypeAssertion', false),
		placeOpenBraceOnNewLineForFunctions: config.get('format.placeOpenBraceOnNewLineForFunctions', false),
		placeOpenBraceOnNewLineForControlBlocks: config.get('format.placeOpenBraceOnNewLineForControlBlocks', false),
		// TS types `semicolons` as a string enum, while the setting is a string union.
		semicolons: config.get('format.semicolons', 'ignore') as ts.SemicolonPreference,
		indentSwitchCase: config.get('format.indentSwitchCase', true),
	};
}
