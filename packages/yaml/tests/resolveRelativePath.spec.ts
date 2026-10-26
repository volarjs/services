import type { LanguageServiceContext } from '@volar/language-service';
import { describe, expect, test, vi } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import * as yaml from 'yaml-language-server';
import { create } from '../index.ts';

vi.mock('yaml-language-server', async importOriginal => {
	const original = await importOriginal<typeof yaml>();
	return { ...original, getLanguageService: vi.fn(original.getLanguageService) };
});

function setup() {
	const sourceDirectory = URI.parse('file:///c:/workspace/');
	const embedded = 'volar-embedded-content://frontmatter_0/file///c%3A/workspace/slides.md';
	const files = new Map<string, string>();
	const readFile = vi.fn(async (uri: URI) => files.get(uri.toString()));
	const decodeEmbeddedDocumentUri = vi.fn((uri: URI) =>
		uri.scheme === 'volar-embedded-content' ? [sourceDirectory, 'frontmatter_0'] : undefined
	);
	const context = {
		env: { fs: { readFile }, clientCapabilities: {} },
		decodeEmbeddedDocumentUri,
	} as unknown as LanguageServiceContext;
	const instance = create().create!(context);
	const options = vi.mocked(yaml.getLanguageService).mock.calls.at(-1)![0];
	const service: yaml.LanguageService = instance.provide!['yaml/languageService']();
	return { embedded, files, readFile, decodeEmbeddedDocumentUri, service, resolver: options.workspaceContext! };
}

describe('YAML workspace context', () => {
	test.each([
		'file:///c:/schemas/frontmatter.json',
		'file:///c:/schemas/frontmatter.json#/definitions/Frontmatter',
		'file:///home/user/schema.json',
		'file://server/share/schema.json',
		'https://example.com/schema.json?version=1#/definitions/Config',
		'http://example.com/schema.json',
		'vscode-userdata:/User/schema.json',
		'urn:example:schema',
		'HTTPS://example.com/schema.json',
	])('preserves the absolute URI %s', reference => {
		const { resolver, decodeEmbeddedDocumentUri } = setup();
		expect(resolver.resolveRelativePath(reference, 'schemaservice://combinedSchema/config')).toBe(reference);
		expect(decodeEmbeddedDocumentUri).not.toHaveBeenCalled();
	});

	test.each([
		['schema.json', 'file:///c:/workspace/schema.json'],
		['./schemas/config.json', 'file:///c:/workspace/schemas/config.json'],
		['../schema.json', 'file:///c:/schema.json'],
		['/schemas/config.json', 'file:///schemas/config.json'],
		['schema with spaces.json', 'file:///c:/workspace/schema%20with%20spaces.json'],
	])('retains relative path resolution for %s', (reference, expected) => {
		const { resolver } = setup();
		expect(resolver.resolveRelativePath(reference, 'file:///c:/workspace/config.yaml')).toBe(
			URI.parse(expected).toString(),
		);
	});

	test('retains relative path resolution for remote resources', () => {
		const { resolver } = setup();
		expect(resolver.resolveRelativePath('../schema.json', 'https://example.com/folder/config.yaml')).toBe(
			'https://example.com/schema.json',
		);
	});

	test('resolves embedded-document relative paths against the source document', () => {
		const { embedded, resolver, decodeEmbeddedDocumentUri } = setup();
		expect(resolver.resolveRelativePath('./schema.json', embedded)).toBe(
			URI.parse('file:///c:/workspace/schema.json').toString(),
		);
		expect(decodeEmbeddedDocumentUri).toHaveBeenCalled();
	});
});

describe('YAML schema validation', () => {
	function setupSchemas() {
		const result = setup();
		const frontmatter = URI.parse('file:///c:/schemas/frontmatter.json').toString();
		const headmatter = URI.parse('file:///c:/schemas/headmatter.json').toString();
		result.files.set(
			frontmatter,
			JSON.stringify({
				type: 'object',
				properties: { transition: { type: 'string' } },
			}),
		);
		result.files.set(
			headmatter,
			JSON.stringify({
				type: 'object',
				properties: { title: { type: 'string' } },
			}),
		);
		result.service.configure({
			validate: true,
			schemas: [
				{ uri: frontmatter, fileMatch: ['*'] },
				{ uri: headmatter, fileMatch: ['*'] },
			],
		});
		return result;
	}

	test('loads combined schemas without rewriting their absolute file URIs', async () => {
		const { service, embedded, readFile } = setupSchemas();
		const document = TextDocument.create(embedded, 'yaml', 1, 'title: Talk\ntransition: slide-left\n');
		expect(await service.doValidation(document, false)).toEqual([]);
		expect(readFile.mock.calls.map(([uri]) => uri.scheme)).toEqual(['file', 'file']);
	});

	test('still reports schema type errors', async () => {
		const { service, embedded } = setupSchemas();
		const document = TextDocument.create(embedded, 'yaml', 2, 'transition: 123\n');
		const diagnostics = await service.doValidation(document, false);
		expect(diagnostics.some(diagnostic => diagnostic.message.includes('Incorrect type'))).toBe(true);
		expect(diagnostics.some(diagnostic => diagnostic.message.includes('Unable to load schema'))).toBe(false);
	});

	test('still reports a genuinely missing schema', async () => {
		const { service, embedded } = setup();
		service.configure({ validate: true, schemas: [{ uri: 'file:///c:/missing.json', fileMatch: ['*'] }] });
		const document = TextDocument.create(embedded, 'yaml', 3, 'transition: slide-left\n');
		expect(
			(await service.doValidation(document, false)).some(diagnostic =>
				diagnostic.message.includes('Unable to load schema')
			),
		).toBe(true);
	});
});
