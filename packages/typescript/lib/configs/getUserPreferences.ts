import * as path from 'path-browserify';
import type * as ts from 'typescript';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { getConfigTitle } from '../shared';
import type { LanguageServiceContext } from '@volar/language-service';
import { URI } from 'vscode-uri';
import type * as _ from '@volar/typescript';

export async function getUserPreferences(
	ctx: LanguageServiceContext,
	document: TextDocument
): Promise<ts.UserPreferences> {
	let currentDirectory = '';
	if (ctx.project.typescript) {
		currentDirectory = ctx.project.typescript.languageServiceHost.getCurrentDirectory();
	}
	const uri = URI.parse(document.uri);
	const documentUri = ctx.decodeEmbeddedDocumentUri(uri)?.[0] ?? uri;
	const config = await ctx.env.getConfiguration?.<any>(getConfigTitle(document)) ?? {};
	const preferencesConfig = config?.preferences ?? {};
	const preferences: ts.UserPreferences = {
		...config.unstable ?? {},
		quotePreference: getQuoteStylePreference(preferencesConfig),
		importModuleSpecifierPreference: getImportModuleSpecifierPreference(preferencesConfig),
		importModuleSpecifierEnding: getImportModuleSpecifierEndingPreference(preferencesConfig),
		jsxAttributeCompletionStyle: getJsxAttributeCompletionStyle(preferencesConfig),
		allowTextChangesInNewFiles: documentUri.scheme === 'file',
		providePrefixAndSuffixTextForRename: (preferencesConfig.renameShorthandProperties ?? true) === false ? false : (preferencesConfig.useAliasesForRenames ?? true),
		allowRenameOfImportPath: true,
		includeAutomaticOptionalChainCompletions: config.suggest?.includeAutomaticOptionalChainCompletions ?? true,
		provideRefactorNotApplicableReason: true,
		generateReturnInDocTemplate: config.suggest?.jsdoc?.generateReturns ?? true,
		includeCompletionsForImportStatements: config.suggest?.includeCompletionsForImportStatements ?? true,
		includeCompletionsWithSnippetText: config.suggest?.includeCompletionsWithSnippetText ?? true,
		includeCompletionsWithClassMemberSnippets: config.suggest?.classMemberSnippets?.enabled ?? true,
		includeCompletionsWithObjectLiteralMethodSnippets: config.suggest?.objectLiteralMethodSnippets?.enabled ?? true,
		autoImportFileExcludePatterns: getAutoImportFileExcludePatternsPreference(preferencesConfig, currentDirectory),
		useLabelDetailsInCompletionEntries: true,
		allowIncompleteCompletions: true,
		displayPartsForJSDoc: true,

		// inlay hints
		includeInlayParameterNameHints: getInlayParameterNameHintsPreference(config),
		includeInlayParameterNameHintsWhenArgumentMatchesName: !(config.inlayHints?.parameterNames?.suppressWhenArgumentMatchesName ?? true),
		includeInlayFunctionParameterTypeHints: config.inlayHints?.parameterTypes?.enabled ?? false,
		includeInlayVariableTypeHints: config.inlayHints?.variableTypes?.enabled ?? false,
		includeInlayVariableTypeHintsWhenTypeMatchesName: !(config.inlayHints?.variableTypes?.suppressWhenTypeMatchesName ?? true),
		includeInlayPropertyDeclarationTypeHints: config.inlayHints?.propertyDeclarationTypes?.enabled ?? false,
		includeInlayFunctionLikeReturnTypeHints: config.inlayHints?.functionLikeReturnTypes?.enabled ?? false,
		includeInlayEnumMemberValueHints: config.inlayHints?.enumMemberValues?.enabled ?? false,

		// https://github.com/microsoft/vscode/blob/main/extensions/typescript-language-features/src/languageFeatures/completions.ts#L728-L730
		includeCompletionsForModuleExports: config.suggest?.autoImports ?? true,
		includeCompletionsWithInsertText: true,
		includePackageJsonAutoImports: preferencesConfig.includePackageJsonAutoImports ?? 'auto',
	};

	return preferences;
}

function getQuoteStylePreference(config: any) {
	switch (config.quoteStyle as string) {
		case 'single': return 'single';
		case 'double': return 'double';
		default: return 'auto';
	}
}

function getAutoImportFileExcludePatternsPreference(config: any, workspacePath: string | undefined) {
	return workspacePath && (config.autoImportFileExcludePatterns as string[] | undefined)?.map(p => {
		// Normalization rules: https://github.com/microsoft/TypeScript/pull/49578
		const slashNormalized = p.replace(/\\/g, '/');
		const isRelative = /^\.\.?($|\/)/.test(slashNormalized);
		return path.isAbsolute(p) ? p :
			p.startsWith('*') ? '/' + slashNormalized :
				isRelative ? path.join(workspacePath, p) :
					'/**/' + slashNormalized;
	});
}

function getImportModuleSpecifierPreference(config: any) {
	switch (config.importModuleSpecifier as string | undefined) {
		case 'project-relative': return 'project-relative';
		case 'relative': return 'relative';
		case 'non-relative': return 'non-relative';
		default: return undefined;
	}
}

function getImportModuleSpecifierEndingPreference(config: any) {
	switch (config.importModuleSpecifierEnding as string | undefined) {
		case 'minimal': return 'minimal';
		case 'index': return 'index';
		case 'js': return 'js';
		default: return 'minimal'; // fix https://github.com/johnsoncodehk/volar/issues/1667
		// default: return 'auto';
	}
}

function getJsxAttributeCompletionStyle(config: any) {
	switch (config.jsxAttributeCompletionStyle as string | undefined) {
		case 'braces': return 'braces';
		case 'none': return 'none';
		default: return 'auto';
	}
}

function getInlayParameterNameHintsPreference(config: any) {
	switch (config.inlayHints?.parameterNames?.enabled) {
		case 'none': return 'none';
		case 'literals': return 'literals';
		case 'all': return 'all';
		default: return undefined;
	}
}
