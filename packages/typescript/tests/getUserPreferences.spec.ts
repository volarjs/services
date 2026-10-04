import { describe, expect, test } from 'vitest';
import { getUserPreferences } from '../lib/configs/getUserPreferences';
import { createContext, document } from './helpers';

function createUserPreferencesContext(settings: Record<string, any>, shape: 'vscode' | 'partial' = 'vscode') {
	return {
		...createContext(settings, shape),
		project: {
			typescript: {
				languageServiceHost: {
					getCurrentDirectory: () => '/workspace',
				},
			},
		},
		decodeEmbeddedDocumentUri: () => undefined,
	} as any;
}

describe('getUserPreferences', () => {
	test('reads unified js/ts.preferences.* settings', async () => {
		const preferences = await getUserPreferences(
			createUserPreferencesContext({
				'js/ts.preferences.quoteStyle': 'single',
				'js/ts.preferences.autoImportSpecifierExcludeRegexes': ['^@/legacy'],
			}),
			document,
		);
		expect(preferences.quotePreference).toBe('single');
		expect(preferences.autoImportSpecifierExcludeRegexes).toEqual(['^@/legacy']);
	});

	test('falls back to language-specific preferences', async () => {
		const preferences = await getUserPreferences(
			createUserPreferencesContext({
				'typescript.preferences.quoteStyle': 'double',
				'typescript.preferences.autoImportSpecifierExcludeRegexes': ['^@/legacy'],
			}),
			document,
		);
		expect(preferences.quotePreference).toBe('double');
		expect(preferences.autoImportSpecifierExcludeRegexes).toEqual(['^@/legacy']);
	});

	test('unified preferences take precedence over language-specific ones', async () => {
		const preferences = await getUserPreferences(
			createUserPreferencesContext({
				'js/ts.preferences.quoteStyle': 'single',
				'typescript.preferences.quoteStyle': 'double',
			}),
			document,
		);
		expect(preferences.quotePreference).toBe('single');
	});

	test('a unified preference equal to the default still falls back', async () => {
		const preferences = await getUserPreferences(
			createUserPreferencesContext({
				'js/ts.preferences.quoteStyle': 'auto',
				'typescript.preferences.quoteStyle': 'double',
			}),
			document,
		);
		expect(preferences.quotePreference).toBe('double');
	});

	test('renameShorthandProperties is still read from the language-specific section', async () => {
		const preferences = await getUserPreferences(
			createUserPreferencesContext({
				'typescript.preferences.renameShorthandProperties': false,
			}),
			document,
		);
		expect(preferences.providePrefixAndSuffixTextForRename).toBe(false);
	});

	test('reads unified js/ts.suggest.* settings', async () => {
		const preferences = await getUserPreferences(
			createUserPreferencesContext({
				'js/ts.suggest.autoImports': false,
				'js/ts.suggest.completeFunctionCalls': true,
			}),
			document,
		);
		expect(preferences.includeCompletionsForModuleExports).toBe(false);
	});

	test('reads unified js/ts.inlayHints.* settings', async () => {
		const preferences = await getUserPreferences(
			createUserPreferencesContext({
				'js/ts.inlayHints.parameterNames.enabled': 'all',
				'js/ts.inlayHints.parameterTypes.enabled': true,
			}),
			document,
		);
		expect(preferences.includeInlayParameterNameHints).toBe('all');
		expect(preferences.includeInlayFunctionParameterTypeHints).toBe(true);
	});

	test('normalizes unified autoImportFileExcludePatterns', async () => {
		const preferences = await getUserPreferences(
			createUserPreferencesContext({
				'js/ts.preferences.autoImportFileExcludePatterns': ['*.test', './legacy'],
			}),
			document,
		);
		expect(preferences.autoImportFileExcludePatterns).toEqual(['/*.test', '/workspace/legacy']);
	});
});
