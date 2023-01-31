import type { LanguageServicePlugin, InlayHint } from '@volar/language-service';
import type { TextDocument } from 'vscode-languageserver-textdocument';

export = (): LanguageServicePlugin => (context) => ({

	inlayHints: {

		on(document, range) {
			if (context.typescript && isTsDocument(document)) {

				const ts = context.typescript.module;
				const inlayHints: InlayHint[] = [];

				for (const pointer of document.getText(range).matchAll(/^\s*\/\/\s*\^\?/gm)) {
					const pointerOffset = pointer.index! + pointer[0].indexOf('^?') + document.offsetAt(range.start);
					const pointerPosition = document.positionAt(pointerOffset);
					const hoverOffset = document.offsetAt({
						line: pointerPosition.line - 1,
						character: pointerPosition.character,
					});

					const quickInfo = context.typescript.languageService.getQuickInfoAtPosition(context.uriToFileName(document.uri), hoverOffset);
					if (quickInfo) {
						inlayHints.push({
							position: { line: pointerPosition.line, character: pointerPosition.character + 2 },
							label: ts.displayPartsToString(quickInfo.displayParts),
							paddingLeft: true,
							paddingRight: false,
						});
					}
				}

				return inlayHints;
			}
		},
	},
});

function isTsDocument(document: TextDocument) {
	return document.languageId === 'javascript' ||
		document.languageId === 'typescript' ||
		document.languageId === 'javascriptreact' ||
		document.languageId === 'typescriptreact';
}