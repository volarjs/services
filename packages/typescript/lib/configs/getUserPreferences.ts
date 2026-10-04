import type { LanguageServiceContext } from '@volar/language-service';
import type * as _ from '@volar/typescript';
import * as path from 'path-browserify';
import type * as ts from 'typescript';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { getConfigTitle } from '../shared';
import { createUnifiedConfig, type UnifiedConfig } from './getUnifiedConfig';

export async function getUserPreferences(
	ctx: LanguageServiceContext,
	document: TextDocument,
): Promise<ts.UserPreferences> {
	let currentDirectory = '';
	if (ctx.project.typescript) {
		currentDirectory = ctx.project.typescript.languageServiceHost.getCurrentDirectory();
	}
	const uri = URI.parse(document.uri);
	const documentUri = ctx.decodeEmbeddedDocumentUri(uri)?.[0] ?? uri;
	const config = await createUnifiedConfig(ctx, document);
	// `renameShorthandProperties` and `unstable` are only available in the
	// language-specific section, there is no unified counterpart.
	const languageConfig = await ctx.env.getConfiguration<any>?.(getConfigTitle(document)) ?? {};
	const preferencesConfig = languageConfig?.preferences ?? {};
	const preferences: ts.UserPreferences = {
		...languageConfig.unstable as {} ?? {},
		quotePreference: getQuoteStylePreference(config),
		importModuleSpecifierPreference: getImportModuleSpecifierPreference(config),
		importModuleSpecifierEnding: getImportModuleSpecifierEndingPreference(config),
		jsxAttributeCompletionStyle: getJsxAttributeCompletionStyle(config),
		allowTextChangesInNewFiles: documentUri.scheme === 'file',
		providePrefixAndSuffixTextForRename: (preferencesConfig.renameShorthandProperties ?? true) === false
			? false
			: config.get('preferences.useAliasesForRenames', true),
		allowRenameOfImportPath: true,
		includeAutomaticOptionalChainCompletions: config.get('suggest.includeAutomaticOptionalChainCompletions', true),
		provideRefactorNotApplicableReason: true,
		generateReturnInDocTemplate: config.get('suggest.jsdoc.generateReturns', true),
		includeCompletionsForImportStatements: config.get('suggest.includeCompletionsForImportStatements', true),
		includeCompletionsWithSnippetText: true,
		includeCompletionsWithClassMemberSnippets: config.get('suggest.classMemberSnippets.enabled', true),
		includeCompletionsWithObjectLiteralMethodSnippets: config.get('suggest.objectLiteralMethodSnippets.enabled', true),
		autoImportFileExcludePatterns: getAutoImportFileExcludePatternsPreference(config, currentDirectory),
		autoImportSpecifierExcludeRegexes: config.get('preferences.autoImportSpecifierExcludeRegexes', undefined),
		useLabelDetailsInCompletionEntries: true,
		allowIncompleteCompletions: true,
		displayPartsForJSDoc: true,

		// inlay hints
		includeInlayParameterNameHints: getInlayParameterNameHintsPreference(config),
		includeInlayParameterNameHintsWhenArgumentMatchesName: !config.get(
			'inlayHints.parameterNames.suppressWhenArgumentMatchesName',
			true,
		),
		includeInlayFunctionParameterTypeHints: config.get('inlayHints.parameterTypes.enabled', false),
		includeInlayVariableTypeHints: config.get('inlayHints.variableTypes.enabled', false),
		includeInlayVariableTypeHintsWhenTypeMatchesName: !config.get(
			'inlayHints.variableTypes.suppressWhenTypeMatchesName',
			true,
		),
		includeInlayPropertyDeclarationTypeHints: config.get('inlayHints.propertyDeclarationTypes.enabled', false),
		includeInlayFunctionLikeReturnTypeHints: config.get('inlayHints.functionLikeReturnTypes.enabled', false),
		includeInlayEnumMemberValueHints: config.get('inlayHints.enumMemberValues.enabled', false),

		// https://github.com/microsoft/vscode/blob/main/extensions/typescript-language-features/src/languageFeatures/completions.ts#L728-L730
		includeCompletionsForModuleExports: config.get('suggest.autoImports', true),
		includeCompletionsWithInsertText: true,
		includePackageJsonAutoImports: config.get('preferences.includePackageJsonAutoImports', 'auto'),
	};

	return preferences;
}

function getQuoteStylePreference(config: UnifiedConfig) {
	switch (config.get('preferences.quoteStyle', 'auto')) {
		case 'single':
			return 'single';
		case 'double':
			return 'double';
		default:
			return 'auto';
	}
}

function getAutoImportFileExcludePatternsPreference(config: UnifiedConfig, workspacePath: string | undefined) {
	if (workspacePath) {
		return config.get('preferences.autoImportFileExcludePatterns', undefined)?.map(p => {
			// Normalization rules: https://github.com/microsoft/TypeScript/pull/49578
			const slashNormalized = p.replace(/\\/g, '/');
			const isRelative = /^\.\.?($|\/)/.test(slashNormalized);
			return path.isAbsolute(p)
				? p
				: p.startsWith('*')
				? '/' + slashNormalized
				: isRelative
				? path.join(workspacePath, p)
				: '/**/' + slashNormalized;
		});
	}
}

function getImportModuleSpecifierPreference(config: UnifiedConfig) {
	switch (config.get('preferences.importModuleSpecifier', 'shortest')) {
		case 'project-relative':
			return 'project-relative';
		case 'relative':
			return 'relative';
		case 'non-relative':
			return 'non-relative';
		default:
			return undefined;
	}
}

function getImportModuleSpecifierEndingPreference(config: UnifiedConfig) {
	switch (config.get('preferences.importModuleSpecifierEnding', 'auto')) {
		case 'minimal':
			return 'minimal';
		case 'index':
			return 'index';
		case 'js':
			return 'js';
		default:
			return 'minimal';
			// default: return 'auto';
			// fix https://github.com/johnsoncodehk/volar/issues/1667
	}
}

function getJsxAttributeCompletionStyle(config: UnifiedConfig) {
	switch (config.get('preferences.jsxAttributeCompletionStyle', 'auto')) {
		case 'braces':
			return 'braces';
		case 'none':
			return 'none';
		default:
			return 'auto';
	}
}

function getInlayParameterNameHintsPreference(config: UnifiedConfig) {
	switch (config.get('inlayHints.parameterNames.enabled', 'none')) {
		case 'literals':
			return 'literals';
		case 'all':
			return 'all';
		default:
			return undefined;
	}
}
