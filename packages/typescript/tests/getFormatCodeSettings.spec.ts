import type { LanguageServiceContext } from '@volar/language-service';
import { describe, expect, test } from 'vitest';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { getFormatCodeSettings } from '../lib/configs/getFormatCodeSettings';

// Mirrors how @volar/kit's createServiceEnvironment resolves flat settings.
function getConfiguration(settings: Record<string, any>) {
	return (section: string) => {
		if (section in settings) {
			return settings[section];
		}
		let result: any;
		for (const settingKey in settings) {
			if (settingKey.startsWith(`${section}.`)) {
				const value = settings[settingKey];
				const props = settingKey.substring(section.length + 1).split('.');
				result ??= {};
				let current = result;
				while (props.length > 1) {
					const prop = props.shift()!;
					if (typeof current[prop] !== 'object') {
						current[prop] = {};
					}
					current = current[prop];
				}
				current[props.shift()!] = value;
			}
		}
		return result;
	};
}

function createContext(settings: Record<string, any>): LanguageServiceContext {
	return {
		env: {
			getConfiguration: getConfiguration(settings),
		},
	} as any;
}

const document = { languageId: 'typescript' } as TextDocument;

describe('getFormatCodeSettings', () => {
	test('uses unified js/ts.format.* settings when configured', async () => {
		const ctx = createContext({
			'js/ts.format.semicolons': 'insert',
			'js/ts.format.placeOpenBraceOnNewLineForControlBlocks': true,
			'js/ts.format.placeOpenBraceOnNewLineForFunctions': true,
		});
		const settings = await getFormatCodeSettings(ctx, document, undefined);
		expect(settings.semicolons).toBe('insert');
		expect(settings.placeOpenBraceOnNewLineForControlBlocks).toBe(true);
		expect(settings.placeOpenBraceOnNewLineForFunctions).toBe(true);
	});

	test('falls back to language-specific format settings', async () => {
		const ctx = createContext({
			'typescript.format.semicolons': 'insert',
			'typescript.format.placeOpenBraceOnNewLineForControlBlocks': true,
			'typescript.format.placeOpenBraceOnNewLineForFunctions': true,
		});
		const settings = await getFormatCodeSettings(ctx, document, undefined);
		expect(settings.semicolons).toBe('insert');
		expect(settings.placeOpenBraceOnNewLineForControlBlocks).toBe(true);
		expect(settings.placeOpenBraceOnNewLineForFunctions).toBe(true);
	});

	test('unified settings take precedence over language-specific settings', async () => {
		const ctx = createContext({
			'js/ts.format.semicolons': 'remove',
			'typescript.format.semicolons': 'insert',
		});
		const settings = await getFormatCodeSettings(ctx, document, undefined);
		expect(settings.semicolons).toBe('remove');
	});

	test('uses defaults when nothing is configured', async () => {
		const ctx = createContext({});
		const settings = await getFormatCodeSettings(ctx, document, undefined);
		expect(settings.semicolons).toBe('ignore');
		expect(settings.placeOpenBraceOnNewLineForControlBlocks).toBe(false);
		expect(settings.placeOpenBraceOnNewLineForFunctions).toBe(false);
		expect(settings.insertSpaceAfterCommaDelimiter).toBe(true);
	});

	test('applies formatting options', async () => {
		const ctx = createContext({});
		const settings = await getFormatCodeSettings(ctx, document, { insertSpaces: true, tabSize: 2 });
		expect(settings.convertTabsToSpaces).toBe(true);
		expect(settings.tabSize).toBe(2);
		expect(settings.indentSize).toBe(2);
	});
});
