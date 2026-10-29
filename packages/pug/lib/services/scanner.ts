import type * as html from 'vscode-html-languageservice';
import type { PugDocument } from '../pugDocument';

export function register(htmlLs: html.LanguageService) {
	return (pugDoc: PugDocument, initialOffset = 0) => {
		const mapper = pugDoc.docs[2] as unknown as AnyMapper;
		const htmlOffset = getStartOffsets(mapper)
			.filter(([sourceOffset]) => sourceOffset >= initialOffset)
			.sort((a, b) => a[1] - b[1])[0]
			?.[1];

		if (htmlOffset === undefined) {
			return;
		}

		const htmlScanner = htmlLs.createScanner(pugDoc.docs[1].getText(), htmlOffset);

		// @ts-expect-error
		const scanner: html.Scanner = {
			scan: () => {
				return htmlScanner.scan();
			},
			getTokenOffset: () => {
				return toSourceOffset(mapper, htmlScanner.getTokenOffset());
			},
			getTokenEnd: () => {
				return toSourceOffset(mapper, htmlScanner.getTokenEnd());
			},
			getTokenText: htmlScanner.getTokenText,
			getTokenLength: htmlScanner.getTokenLength,
			getTokenError: htmlScanner.getTokenError,
			getScannerState: htmlScanner.getScannerState,
		};

		return scanner;
	};
}

// @volar/language-service 2 maps with `{ sourceOffsets, generatedOffsets }` objects and `toSourceLocation`,
// volar.js 4 with `SpanMap` segments and `virtualToOriginalPositions`.
type AnyMapper =
	| {
		mappings: { sourceOffsets: number[]; generatedOffsets: number[] }[];
		toSourceLocation(offset: number): Iterable<[number, unknown]>;
	}
	| {
		segments: readonly { virtualStart: number; originalStart: number }[];
		virtualToOriginalPositions(offset: number): readonly { position: number }[];
	};

function getStartOffsets(mapper: AnyMapper): [sourceOffset: number, generatedOffset: number][] {
	if ('segments' in mapper) {
		return mapper.segments.map(segment => [segment.originalStart, segment.virtualStart]);
	}
	return mapper.mappings.map(mapping => [mapping.sourceOffsets[0], mapping.generatedOffsets[0]]);
}

function toSourceOffset(mapper: AnyMapper, offset: number) {
	if ('segments' in mapper) {
		return mapper.virtualToOriginalPositions(offset)[0]?.position ?? -1;
	}
	for (const [sourceOffset] of mapper.toSourceLocation(offset)) {
		return sourceOffset;
	}
	return -1;
}
