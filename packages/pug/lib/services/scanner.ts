import type * as html from 'vscode-html-languageservice';
import type { PugDocument } from '../pugDocument';

export function register(htmlLs: html.LanguageService) {
	return (pugDoc: PugDocument, initialOffset = 0) => {
		const htmlOffset = pugDoc.docs[2].mappings
			.map(getStartOffsets)
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
				for (const [offset] of pugDoc.docs[2].toSourceLocation(htmlScanner.getTokenOffset())) {
					return offset;
				}
				return -1;
			},
			getTokenEnd: () => {
				for (const [offset] of pugDoc.docs[2].toSourceLocation(htmlScanner.getTokenEnd())) {
					return offset;
				}
				return -1;
			},
			getTokenText: htmlScanner.getTokenText,
			getTokenLength: htmlScanner.getTokenLength,
			getTokenError: htmlScanner.getTokenError,
			getScannerState: htmlScanner.getScannerState,
		};

		return scanner;
	};
}

// @volar/language-service 2 maps with `{ sourceOffsets, generatedOffsets }` objects,
// volar.js 3 with `[generatedStart, generatedLength, sourceStart, sourceLength, kind, features]` tuples.
function getStartOffsets(mapping: unknown): [sourceOffset: number, generatedOffset: number] {
	if (Array.isArray(mapping)) {
		return [mapping[2], mapping[0]];
	}
	const { sourceOffsets, generatedOffsets } = mapping as { sourceOffsets: number[]; generatedOffsets: number[] };
	return [sourceOffsets[0], generatedOffsets[0]];
}
