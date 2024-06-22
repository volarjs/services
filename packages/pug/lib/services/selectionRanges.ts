import type * as html from 'vscode-html-languageservice';
import type { PugDocument } from '../pugDocument';
import { transformLocations } from '@volar/language-service';
import { getGeneratedPositions, getSourceRange } from '@volar/language-service/lib/utils/featureWorkers';

export function register(htmlLs: html.LanguageService) {
	return (pugDoc: PugDocument, posArr: html.Position[]) => {

		const htmlPosArr = posArr
			.map(position => {
				for (const pos of getGeneratedPositions(pugDoc.docs, position)) {
					return pos;
				}
			})
			.filter((v): v is NonNullable<typeof v> => !!v);

		const htmlResult = htmlLs.getSelectionRanges(
			pugDoc.docs[1],
			htmlPosArr
		);

		return transformLocations(htmlResult, htmlRange => getSourceRange(pugDoc.docs, htmlRange));
	};
}
