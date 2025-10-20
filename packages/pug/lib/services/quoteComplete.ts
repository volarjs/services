import { getGeneratedPositions } from '@volar/language-service/lib/utils/featureWorkers';
import type * as html from 'vscode-html-languageservice';
import type { PugDocument } from '../pugDocument';

export function register(htmlLs: html.LanguageService) {
	return (pugDoc: PugDocument, pos: html.Position, options?: html.CompletionConfiguration) => {

		for (const htmlStart of getGeneratedPositions(pugDoc.docs, pos)) {

			const text = htmlLs.doQuoteComplete(
				pugDoc.docs[1],
				htmlStart,
				pugDoc.htmlDocument,
				options
			);

			return text;
		}
	};
}
