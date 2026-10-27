import { describe, expect, test } from 'vitest';
import * as html from 'vscode-html-languageservice';
import { getLanguageService, type PugDocument } from '../lib/languageService';

const pugLs = getLanguageService(html.getLanguageService());
const pugCode = `div#app
  p.text hello
  a(href="/") link
`;

function scanTokens(pugDoc: PugDocument, initialOffset?: number) {
	const scanner = pugLs.createScanner(pugDoc, initialOffset);
	const tokens: [type: html.TokenType, offset: number, end: number, text: string][] = [];
	if (!scanner) {
		return tokens;
	}
	for (let type = scanner.scan(); type !== html.TokenType.EOS; type = scanner.scan()) {
		tokens.push([type, scanner.getTokenOffset(), scanner.getTokenEnd(), scanner.getTokenText()]);
	}
	return tokens;
}

// volar.js 3 maps with `[generatedStart, generatedLength, sourceStart, sourceLength, kind, features]` tuples
// instead of `{ sourceOffsets, generatedOffsets, lengths }` objects.
function withTupleMappings(pugDoc: PugDocument): PugDocument {
	const [pugTextDocument, htmlTextDocument, mapper] = pugDoc.docs;
	const mappings = mapper.mappings.flatMap(mapping =>
		mapping.sourceOffsets.map((sourceOffset, i) => [
			mapping.generatedOffsets[i],
			mapping.generatedLengths?.[i] ?? mapping.lengths[i],
			sourceOffset,
			mapping.lengths[i],
			0,
			0,
		])
	);
	const tupleMapper = new Proxy(mapper, {
		get(target, key) {
			if (key === 'mappings') {
				return mappings;
			}
			const value = Reflect.get(target, key);
			return typeof value === 'function' ? value.bind(target) : value;
		},
	});
	return { ...pugDoc, docs: [pugTextDocument, htmlTextDocument, tupleMapper] };
}

describe('pug scanner', () => {
	const pugDoc = pugLs.parsePugDocument(pugCode);

	test('scans the generated HTML in pug offsets', () => {
		const tokens = scanTokens(pugDoc);
		expect(tokens.some(([type, , , text]) => type === html.TokenType.StartTag && text === 'p')).toBe(true);
		for (const [type, offset, end, text] of tokens) {
			if (type === html.TokenType.StartTag) {
				expect(offset).toBeGreaterThanOrEqual(0);
				expect(pugCode.slice(offset, end)).toBe(text);
			}
		}
	});

	test('scans the same with volar.js 3 tuple mappings', () => {
		expect(scanTokens(withTupleMappings(pugDoc))).toEqual(scanTokens(pugDoc));
		const initialOffset = pugCode.indexOf('a(');
		expect(scanTokens(withTupleMappings(pugDoc), initialOffset)).toEqual(scanTokens(pugDoc, initialOffset));
	});
});
