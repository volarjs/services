import { describe, expect, test } from 'vitest';
import { createUnifiedConfig } from '../lib/configs/getUnifiedConfig';
import { createContext, document } from './helpers';

describe('createUnifiedConfig', () => {
	test('unified js/ts.* settings take precedence over language-specific settings', async () => {
		const config = await createUnifiedConfig(
			createContext({
				'js/ts.format.semicolons': 'insert',
				'typescript.format.semicolons': 'remove',
			}),
			document,
		);
		expect(config.get('format.semicolons', 'ignore')).toBe('insert');
	});

	test('a unified value equal to its registered default still falls back', async () => {
		// VS Code resolves `js/ts.format.semicolons` to its default `'ignore'`
		// even when the user never touched it, so the language-specific setting
		// must win here.
		const config = await createUnifiedConfig(
			createContext({
				'js/ts.format.semicolons': 'ignore',
				'typescript.format.semicolons': 'insert',
			}),
			document,
		);
		expect(config.get('format.semicolons', 'ignore')).toBe('insert');
	});

	test('falls back to language-specific settings when unified is not returned', async () => {
		const config = await createUnifiedConfig(
			createContext(
				{
					'typescript.preferences.quoteStyle': 'single',
				},
				'partial',
			),
			document,
		);
		expect(config.get('preferences.quoteStyle', 'auto')).toBe('single');
	});

	test('a host returning only explicitly-set values resolves like a resolved host', async () => {
		const config = await createUnifiedConfig(
			createContext(
				{
					'js/ts.format.semicolons': 'ignore',
					'typescript.format.semicolons': 'insert',
				},
				'partial',
			),
			document,
		);
		// A host that reports only explicitly-set values is *more* precise, but
		// both shapes go through the same default comparison, so the documented
		// limitation applies here too: an explicit default is indistinguishable
		// from an unset value.
		expect(config.get('format.semicolons', 'ignore')).toBe('insert');
	});

	test('uses the fallback default when nothing is configured', async () => {
		const config = await createUnifiedConfig(createContext({}), document);
		expect(config.get('format.semicolons', 'ignore')).toBe('ignore');
		expect(config.get('format.placeOpenBraceOnNewLineForFunctions', false)).toBe(false);
		expect(config.get('preferences.quoteStyle', 'auto')).toBe('auto');
	});
});
