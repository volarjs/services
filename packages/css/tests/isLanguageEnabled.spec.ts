import type { LanguageServiceContext } from '@volar/language-service';
import { describe, expect, test } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { create, type Provide } from '..';

function createInstance(configuration: Record<string, unknown>, options?: Parameters<typeof create>[0]) {
	const listeners: (() => void)[] = [];
	const context = {
		env: {
			workspaceFolders: [],
			getConfiguration: async (section: string) => configuration[section],
			onDidChangeConfiguration: (listener: () => void) => {
				listeners.push(listener);
				return { dispose() {} };
			},
		},
		decodeEmbeddedDocumentUri: () => undefined,
	} as unknown as LanguageServiceContext;
	const instance = create(options).create(context);
	return {
		instance,
		changeConfiguration(newConfiguration: Record<string, unknown>) {
			configuration = newConfiguration;
			listeners.forEach(listener => listener());
		},
	};
}

const scssDocument = TextDocument.create('file:///test.scss', 'scss', 0, '$color: red;\na { color: $color; }\n');
const cssDocument = TextDocument.create('file:///test.css', 'css', 0, 'a { color: red; }\n');
const position = { line: 1, character: 12 };

describe('isLanguageEnabled', () => {
	test('languages are enabled by default', async () => {
		const { instance } = createInstance({});

		expect(await instance.provideDefinition?.(scssDocument, position, undefined!)).toHaveLength(1);
		expect(await instance.provideDocumentSymbols?.(cssDocument, undefined!)).not.toHaveLength(0);
	});

	test('disables a language through `<languageId>.languageService.enable`', async () => {
		const { instance } = createInstance({ 'scss.languageService.enable': false });

		expect(await instance.provideDefinition?.(scssDocument, position, undefined!)).toBeUndefined();
		expect(await instance.provideHover?.(scssDocument, position, undefined!)).toBeUndefined();
		expect(await instance.provideCompletionItems?.(scssDocument, position, undefined!, undefined!)).toBeUndefined();
		expect(await instance.provideDiagnostics?.(scssDocument, undefined!)).toBeUndefined();
		expect(await instance.provideDocumentSymbols?.(scssDocument, undefined!)).toBeUndefined();
		expect((instance.provide as Provide)['css/languageService'](scssDocument)).toBeUndefined();

		expect(await instance.provideDocumentSymbols?.(cssDocument, undefined!)).not.toHaveLength(0);
	});

	test('checks the document language, not the language service', async () => {
		const { instance } = createInstance({ 'scss.languageService.enable': false }, {
			scssDocumentSelector: ['scss', 'postcss'],
		});
		const postcssDocument = TextDocument.create('file:///test.postcss', 'postcss', 0, scssDocument.getText());

		expect(await instance.provideDefinition?.(scssDocument, position, undefined!)).toBeUndefined();
		expect(await instance.provideDefinition?.(postcssDocument, position, undefined!)).toHaveLength(1);
	});

	test('follows configuration changes', async () => {
		const { instance, changeConfiguration } = createInstance({});

		expect(await instance.provideDefinition?.(scssDocument, position, undefined!)).toHaveLength(1);

		changeConfiguration({ 'scss.languageService.enable': false });
		expect(await instance.provideDefinition?.(scssDocument, position, undefined!)).toBeUndefined();

		changeConfiguration({});
		expect(await instance.provideDefinition?.(scssDocument, position, undefined!)).toHaveLength(1);
	});
});
