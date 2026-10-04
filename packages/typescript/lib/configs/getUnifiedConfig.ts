import type { LanguageServiceContext } from '@volar/language-service';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { getConfigTitle } from '../shared';

const unifiedSection = 'js/ts';

/**
 * Value type of each unified `js/ts.*` setting, so `get()` can stay typed
 * without a cast at every call site.
 */
export interface UnifiedValues {
	format: {
		enabled: boolean;
		insertSpaceAfterCommaDelimiter: boolean;
		insertSpaceAfterConstructor: boolean;
		insertSpaceAfterSemicolonInForStatements: boolean;
		insertSpaceBeforeAndAfterBinaryOperators: boolean;
		insertSpaceAfterKeywordsInControlFlowStatements: boolean;
		insertSpaceAfterFunctionKeywordForAnonymousFunctions: boolean;
		insertSpaceBeforeFunctionParenthesis: boolean;
		insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: boolean;
		insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: boolean;
		insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: boolean;
		insertSpaceAfterOpeningAndBeforeClosingEmptyBraces: boolean;
		insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: boolean;
		insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces: boolean;
		insertSpaceAfterTypeAssertion: boolean;
		placeOpenBraceOnNewLineForFunctions: boolean;
		placeOpenBraceOnNewLineForControlBlocks: boolean;
		semicolons: 'ignore' | 'insert' | 'remove';
		indentSwitchCase: boolean;
	};
	preferences: {
		quoteStyle: 'auto' | 'single' | 'double';
		importModuleSpecifier: 'shortest' | 'project-relative' | 'relative' | 'non-relative';
		importModuleSpecifierEnding: 'auto' | 'minimal' | 'index' | 'js';
		jsxAttributeCompletionStyle: 'auto' | 'braces' | 'none';
		includePackageJsonAutoImports: 'auto' | 'on' | 'off';
		autoImportFileExcludePatterns: string[] | undefined;
		autoImportSpecifierExcludeRegexes: string[] | undefined;
		preferTypeOnlyAutoImports: boolean;
		useAliasesForRenames: boolean;
		renameMatchingJsxTags: boolean;
		organizeImports: object | undefined;
	};
	suggest: {
		enabled: boolean;
		autoImports: boolean;
		names: boolean;
		completeFunctionCalls: boolean;
		paths: boolean;
		jsdoc: { generateReturns: boolean };
		includeAutomaticOptionalChainCompletions: boolean;
		includeCompletionsForImportStatements: boolean;
		classMemberSnippets: { enabled: boolean };
		objectLiteralMethodSnippets: { enabled: boolean };
	};
	validate: { enabled: boolean };
	autoClosingTags: { enabled: boolean };
	inlayHints: {
		parameterNames: { enabled: 'none' | 'literals' | 'all'; suppressWhenArgumentMatchesName: boolean };
		parameterTypes: { enabled: boolean };
		variableTypes: { enabled: boolean; suppressWhenTypeMatchesName: boolean };
		propertyDeclarationTypes: { enabled: boolean };
		functionLikeReturnTypes: { enabled: boolean };
		enumMemberValues: { enabled: boolean };
	};
}

/**
 * Registered defaults of the unified `js/ts.*` settings.
 *
 * VS Code's built-in TypeScript extension reads the unified `js/ts.*` setting
 * first and falls back to the deprecated `typescript.*` / `javascript.*`
 * section only when the unified value was not modified by the user. It can do
 * that because it runs in-process and has `WorkspaceConfiguration.inspect()`.
 * A language server cannot: `workspace/configuration` returns the resolved
 * value (registered default included), with no way to tell an unset setting
 * from one explicitly set to its default.
 *
 * Until the protocol carries that information, we mirror the precedence by
 * treating a unified value that equals its registered default as unset. Keep
 * this table in sync with `contributes.configuration` of VS Code's
 * `typescript-language-features` extension; a changed default is a one-line
 * update here.
 */
export const unifiedDefaults = {
	format: {
		enabled: true,
		insertSpaceAfterCommaDelimiter: true,
		insertSpaceAfterConstructor: false,
		insertSpaceAfterSemicolonInForStatements: true,
		insertSpaceBeforeAndAfterBinaryOperators: true,
		insertSpaceAfterKeywordsInControlFlowStatements: true,
		insertSpaceAfterFunctionKeywordForAnonymousFunctions: true,
		insertSpaceBeforeFunctionParenthesis: false,
		insertSpaceAfterOpeningAndBeforeClosingNonemptyParenthesis: false,
		insertSpaceAfterOpeningAndBeforeClosingNonemptyBrackets: false,
		insertSpaceAfterOpeningAndBeforeClosingNonemptyBraces: true,
		insertSpaceAfterOpeningAndBeforeClosingEmptyBraces: true,
		insertSpaceAfterOpeningAndBeforeClosingTemplateStringBraces: false,
		insertSpaceAfterOpeningAndBeforeClosingJsxExpressionBraces: false,
		insertSpaceAfterTypeAssertion: false,
		placeOpenBraceOnNewLineForFunctions: false,
		placeOpenBraceOnNewLineForControlBlocks: false,
		semicolons: 'ignore',
		indentSwitchCase: true,
	},
	preferences: {
		quoteStyle: 'auto',
		importModuleSpecifier: 'shortest',
		importModuleSpecifierEnding: 'auto',
		jsxAttributeCompletionStyle: 'auto',
		includePackageJsonAutoImports: 'auto',
		autoImportFileExcludePatterns: undefined,
		autoImportSpecifierExcludeRegexes: undefined,
		preferTypeOnlyAutoImports: false,
		useAliasesForRenames: true,
		renameMatchingJsxTags: true,
		organizeImports: undefined,
	},
	suggest: {
		enabled: true,
		autoImports: true,
		names: true,
		completeFunctionCalls: false,
		paths: true,
		jsdoc: { generateReturns: true },
		includeAutomaticOptionalChainCompletions: true,
		includeCompletionsForImportStatements: true,
		classMemberSnippets: { enabled: true },
		objectLiteralMethodSnippets: { enabled: true },
	},
	validate: { enabled: true },
	autoClosingTags: { enabled: true },
	inlayHints: {
		parameterNames: { enabled: 'none', suppressWhenArgumentMatchesName: true },
		parameterTypes: { enabled: false },
		variableTypes: { enabled: false, suppressWhenTypeMatchesName: true },
		propertyDeclarationTypes: { enabled: false },
		functionLikeReturnTypes: { enabled: false },
		enumMemberValues: { enabled: false },
	},
} satisfies UnifiedValues;

export type UnifiedSettingKey = {
	[K in keyof UnifiedValues]: `${K & string}.${DotPaths<UnifiedValues[K]>}`;
}[keyof UnifiedValues];

type DotPaths<T> = {
	[K in keyof T & string]: T[K] extends Record<string, any> ? K | `${K}.${DotPaths<T[K]>}` : K;
}[keyof T & string];

type PathValue<T, K extends string> = K extends `${infer Head}.${infer Rest}`
	? Head extends keyof T ? PathValue<T[Head], Rest>
	: never
	: K extends keyof T ? T[K]
	: never;

export interface UnifiedConfig {
	/**
	 * Reads a setting with the unified `js/ts.*` section taking precedence over
	 * the language-specific `typescript.*` / `javascript.*` section.
	 *
	 * `key` is a dotted path inside `js/ts`, e.g. `'format.semicolons'`. The
	 * language-specific section is only consulted for keys that have no unified
	 * counterpart, so this is backwards compatible.
	 */
	get<K extends UnifiedSettingKey>(key: K, fallbackDefault: PathValue<UnifiedValues, K>): PathValue<UnifiedValues, K>;
}

/**
 * Builds the unified/language-specific view of the settings for `document`.
 *
 * The sections are resolved once and the reads stay synchronous, so a single
 * instance can be shared by a whole call.
 */
export async function createUnifiedConfig(
	ctx: LanguageServiceContext,
	document: TextDocument,
): Promise<UnifiedConfig> {
	const languageSection = getConfigTitle(document);
	const unified = await ctx.env.getConfiguration<Record<string, unknown>>?.(unifiedSection) ?? {};
	const language = await ctx.env.getConfiguration<Record<string, unknown>>?.(languageSection) ?? {};

	function getByPath(config: Record<string, unknown>, path: string[]): unknown {
		let current: unknown = config;
		for (const prop of path) {
			if (typeof current !== 'object' || current === null) {
				return undefined;
			}
			current = (current as Record<string, unknown>)[prop];
		}
		return current;
	}

	function getDefault(path: string[]): unknown {
		return getByPath(unifiedDefaults as unknown as Record<string, unknown>, path);
	}

	return {
		get<K extends UnifiedSettingKey>(
			key: K,
			fallbackDefault: PathValue<UnifiedValues, K>,
		): PathValue<UnifiedValues, K> {
			const path = key.split('.');
			const keyDefault = getDefault(path);
			// A host that resolves the whole section always includes `key`, even
			// when the user never touched it, so the default comparison is the only
			// signal available there. A host that only returns explicitly-set
			// settings (e.g. `@volar/kit`) omits unset keys entirely; both shapes
			// resolve through this same check so they stay consistent.
			const unifiedValue = getByPath(unified, path);
			if (unifiedValue !== undefined && unifiedValue !== keyDefault) {
				return unifiedValue as PathValue<UnifiedValues, K>;
			}
			const languageValue = getByPath(language, path);
			if (languageValue !== undefined) {
				return languageValue as PathValue<UnifiedValues, K>;
			}
			return fallbackDefault;
		},
	};
}
