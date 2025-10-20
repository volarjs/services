import { transformLocations } from '@volar/language-service';
import { getSourceRange } from '@volar/language-service/lib/utils/featureWorkers';
import type * as html from 'vscode-html-languageservice';
import type { PugDocument } from '../pugDocument';

export function register(htmlLs: html.LanguageService) {
	return (pugDoc: PugDocument, docContext: html.DocumentContext) => {
		const htmlResult = htmlLs.findDocumentLinks(
			pugDoc.docs[1],
			docContext,
		);

		return transformLocations(
			htmlResult,
			htmlRange => getSourceRange(pugDoc.docs, htmlRange),
		);
	};
}
