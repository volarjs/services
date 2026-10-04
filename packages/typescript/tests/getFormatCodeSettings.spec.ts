import { describe, expect, test } from 'vitest';
import { getFormatCodeSettings } from '../lib/configs/getFormatCodeSettings';
import { createContext, document } from './helpers';

describe('getFormatCodeSettings', () => {
	test('uses unified js/ts.format.* settings when configured', async () => {
		const settings = await getFormatCodeSettings(
			createContext({
				'js/ts.format.semicolons': 'insert',
				'js/ts.format.placeOpenBraceOnNewLineForControlBlocks': true,
				'js/ts.format.placeOpenBraceOnNewLineForFunctions': true,
			}),
			document,
			undefined,
		);
		expect(settings.semicolons).toBe('insert');
		expect(settings.placeOpenBraceOnNewLineForControlBlocks).toBe(true);
		expect(settings.placeOpenBraceOnNewLineForFunctions).toBe(true);
	});

	test('falls back to language-specific format settings', async () => {
		const settings = await getFormatCodeSettings(
			createContext({
				'typescript.format.semicolons': 'insert',
				'typescript.format.placeOpenBraceOnNewLineForControlBlocks': true,
				'typescript.format.placeOpenBraceOnNewLineForFunctions': true,
			}),
			document,
			undefined,
		);
		expect(settings.semicolons).toBe('insert');
		expect(settings.placeOpenBraceOnNewLineForControlBlocks).toBe(true);
		expect(settings.placeOpenBraceOnNewLineForFunctions).toBe(true);
	});

	test('unified settings take precedence over language-specific settings', async () => {
		const settings = await getFormatCodeSettings(
			createContext({
				'js/ts.format.semicolons': 'remove',
				'typescript.format.semicolons': 'insert',
			}),
			document,
			undefined,
		);
		expect(settings.semicolons).toBe('remove');
	});

	test('a unified value equal to the default does not shadow the language-specific setting', async () => {
		const settings = await getFormatCodeSettings(
			createContext({
				'js/ts.format.placeOpenBraceOnNewLineForFunctions': false,
				'typescript.format.placeOpenBraceOnNewLineForFunctions': true,
			}),
			document,
			undefined,
		);
		expect(settings.placeOpenBraceOnNewLineForFunctions).toBe(true);
	});

	test('uses defaults when nothing is configured', async () => {
		const settings = await getFormatCodeSettings(createContext({}), document, undefined);
		expect(settings.semicolons).toBe('ignore');
		expect(settings.placeOpenBraceOnNewLineForControlBlocks).toBe(false);
		expect(settings.placeOpenBraceOnNewLineForFunctions).toBe(false);
		expect(settings.insertSpaceAfterCommaDelimiter).toBe(true);
		expect(settings.indentSwitchCase).toBe(true);
	});

	test('applies formatting options', async () => {
		const settings = await getFormatCodeSettings(createContext({}), document, {
			insertSpaces: true,
			tabSize: 2,
		});
		expect(settings.convertTabsToSpaces).toBe(true);
		expect(settings.tabSize).toBe(2);
		expect(settings.indentSize).toBe(2);
	});
});
