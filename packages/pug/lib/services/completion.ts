import type * as html from 'vscode-html-languageservice';
import { TextDocument } from 'vscode-html-languageservice';
import type { PugDocument } from '../pugDocument';
import { ServiceContext, transformCompletionList } from '@volar/language-service';

export function register(htmlLs: html.LanguageService) {

	const docForEmptyLineCompletion = TextDocument.create('file:///foo.html', 'html', 0, '< />');
	const htmlDocForEmptyLineCompletion = htmlLs.parseHTMLDocument(docForEmptyLineCompletion);
	const posForEmptyLine = docForEmptyLineCompletion.positionAt(1);

	return async (
		pugDoc: PugDocument,
		pos: html.Position,
		serviceContext: ServiceContext,
		documentContext: html.DocumentContext | undefined,
		options?: html.CompletionConfiguration | undefined
	) => {

		const offset = pugDoc.pugTextDocument.offsetAt(pos);

		if (pugDoc.emptyLineEnds.includes(offset)) {

			const htmlComplete = htmlLs.doComplete(
				docForEmptyLineCompletion,
				posForEmptyLine,
				htmlDocForEmptyLineCompletion,
				options,
			);
			for (const item of htmlComplete.items) {
				item.textEdit = undefined;
			}
			return htmlComplete;
		}

		const htmlPos = pugDoc.map.getGeneratedPosition(pos);
		if (!htmlPos)
			return;

		const htmlComplete = documentContext ? await htmlLs.doComplete2(
			pugDoc.htmlTextDocument,
			htmlPos,
			pugDoc.htmlDocument,
			documentContext,
			options,
		) : htmlLs.doComplete(
			pugDoc.htmlTextDocument,
			htmlPos,
			pugDoc.htmlDocument,
			options,
		);

		return transformCompletionList(
			htmlComplete,
			htmlRange => pugDoc.map.getSourceRange(htmlRange),
			pugDoc.map.virtualFileDocument,
			serviceContext,
		);
	};
}
