import type * as html from 'vscode-html-languageservice';
import { TextDocument } from 'vscode-html-languageservice';
import type { PugDocument } from '../pugDocument';
import { type LanguageServiceContext, transformCompletionList } from '@volar/language-service';
import { getGeneratedPositions, getSourceRange } from '@volar/language-service/lib/utils/featureWorkers';

export function register(htmlLs: html.LanguageService) {

	const docForEmptyLineCompletion = TextDocument.create('file:///foo.html', 'html', 0, '< />');
	const htmlDocForEmptyLineCompletion = htmlLs.parseHTMLDocument(docForEmptyLineCompletion);
	const posForEmptyLine = docForEmptyLineCompletion.positionAt(1);

	return async (
		pugDoc: PugDocument,
		pos: html.Position,
		serviceContext: LanguageServiceContext,
		documentContext?: html.DocumentContext,
		options?: html.CompletionConfiguration
	) => {

		const offset = pugDoc.pugTextDocument.offsetAt(pos);

		if (pugDoc.emptyLineEnds.includes(offset)) {

			const htmlComplete = htmlLs.doComplete(
				docForEmptyLineCompletion,
				posForEmptyLine,
				htmlDocForEmptyLineCompletion,
				options
			);
			for (const item of htmlComplete.items) {
				item.textEdit = undefined;
			}
			return htmlComplete;
		}

		for (const htmlPos of getGeneratedPositions(pugDoc.docs, pos)) {
			const htmlComplete = documentContext ? await htmlLs.doComplete2(
				pugDoc.docs[1],
				htmlPos,
				pugDoc.htmlDocument,
				documentContext,
				options
			) : htmlLs.doComplete(
				pugDoc.docs[1],
				htmlPos,
				pugDoc.htmlDocument,
				options
			);

			return transformCompletionList(
				htmlComplete,
				htmlRange => getSourceRange(pugDoc.docs, htmlRange),
				pugDoc.docs[1],
				serviceContext
			);
		}
	};
}
