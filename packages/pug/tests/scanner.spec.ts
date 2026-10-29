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

interface Segment {
	virtualStart: number;
	virtualEnd: number;
	originalStart: number;
	originalEnd: number;
}

// volar.js 4 maps with `SpanMap` segments and `virtualToOriginalPositions`
// instead of `{ sourceOffsets, generatedOffsets, lengths }` objects and `toSourceLocation`.
function withSpanMap(pugDoc: PugDocument): PugDocument {
	const [pugTextDocument, htmlTextDocument, mapper] = pugDoc.docs;
	const source = mapper as unknown as {
		segments?: Segment[];
		mappings?: { sourceOffsets: number[]; generatedOffsets: number[]; lengths: number[] }[];
	};
	if (source.segments) {
		return pugDoc;
	}
	const segments = source.mappings!.flatMap(mapping =>
		mapping.sourceOffsets.map((sourceOffset, i): Segment => ({
			virtualStart: mapping.generatedOffsets[i],
			virtualEnd: mapping.generatedOffsets[i] + mapping.lengths[i],
			originalStart: sourceOffset,
			originalEnd: sourceOffset + mapping.lengths[i],
		}))
	);
	const spanMap = {
		segments,
		virtualToOriginalPositions: (offset: number) =>
			segments
				.filter(segment => segment.virtualStart <= offset && offset <= segment.virtualEnd)
				.map(segment => ({ position: segment.originalStart + offset - segment.virtualStart })),
	};
	return { ...pugDoc, docs: [pugTextDocument, htmlTextDocument, spanMap as never] };
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

	test('scans the same with a volar.js 4 span map', () => {
		expect(scanTokens(withSpanMap(pugDoc))).toEqual(scanTokens(pugDoc));
		const initialOffset = pugCode.indexOf('a(');
		expect(scanTokens(withSpanMap(pugDoc), initialOffset)).toEqual(scanTokens(pugDoc, initialOffset));
	});
});
