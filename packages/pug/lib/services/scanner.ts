import type * as html from 'vscode-html-languageservice';
import type { PugDocument } from '../pugDocument';

export function register(htmlLs: html.LanguageService) {
	return (pugDoc: PugDocument, initialOffset = 0) => {

		const htmlOffset = pugDoc.map.map.mappings
			.filter(mapping => mapping.sourceOffsets[0] >= initialOffset)
			.sort((a, b) => a.generatedOffsets[0] - b.generatedOffsets[0])[0]
			?.generatedOffsets[0];

		if (htmlOffset === undefined) {
			return;
		}

		const htmlScanner = htmlLs.createScanner(pugDoc.htmlTextDocument.getText(), htmlOffset);

		// @ts-expect-error
		const scanner: html.Scanner = {
			scan: () => {
				return htmlScanner.scan();
			},
			getTokenOffset: () => {
				for (const [offset] of pugDoc.map.map.getSourceOffsets(htmlScanner.getTokenOffset())) {
					return offset;
				}
				return -1;
			},
			getTokenEnd: () => {
				for (const [offset] of pugDoc.map.map.getSourceOffsets(htmlScanner.getTokenEnd())) {
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
