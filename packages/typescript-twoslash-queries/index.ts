import type { InlayHint, ServicePlugin, ServicePluginInstance } from '@volar/language-service';
import type { Provide } from 'volar-service-typescript';

export function create(): ServicePlugin {
	return {
		name: 'typescript-twoslash-queries',
		create(context): ServicePluginInstance {
			return {
				provideInlayHints(document, range) {
					if (isTsDocument(document.languageId)) {

						const ts = context.inject<Provide, 'typescript/typescript'>('typescript/typescript');
						const languageService = context.inject<Provide, 'typescript/languageService'>('typescript/languageService');
						const inlayHints: InlayHint[] = [];

						for (const pointer of document.getText(range).matchAll(/^\s*\/\/\s*\^\?/gm)) {
							const pointerOffset = pointer.index! + pointer[0].indexOf('^?') + document.offsetAt(range.start);
							const pointerPosition = document.positionAt(pointerOffset);
							const hoverOffset = document.offsetAt({
								line: pointerPosition.line - 1,
								character: pointerPosition.character,
							});

							const fileName = context.env.typescript.uriToFileName(document.uri);
							const quickInfo = languageService.getQuickInfoAtPosition(fileName, hoverOffset);
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
			};
		},
	};
}

function isTsDocument(languageId: string) {
	return languageId === 'javascript' ||
		languageId === 'typescript' ||
		languageId === 'javascriptreact' ||
		languageId === 'typescriptreact';
}
