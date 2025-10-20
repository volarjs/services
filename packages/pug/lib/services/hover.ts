import { transformHover } from '@volar/language-service';
import { getGeneratedPositions, getSourceRange } from '@volar/language-service/lib/utils/featureWorkers';
import type * as html from 'vscode-html-languageservice';
import type { PugDocument } from '../pugDocument';

export function register(htmlLs: html.LanguageService) {
	return (pugDoc: PugDocument, pos: html.Position, options?: html.HoverSettings) => {
		for (const htmlPos of getGeneratedPositions(pugDoc.docs, pos)) {
			const htmlResult = htmlLs.doHover(
				pugDoc.docs[1],
				htmlPos,
				pugDoc.htmlDocument,
				options,
			);
			if (!htmlResult) {
				return;
			}

			return transformHover(htmlResult, htmlRange => getSourceRange(pugDoc.docs, htmlRange));
		}
	};
}
