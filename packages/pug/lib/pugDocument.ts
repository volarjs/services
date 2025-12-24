import { defaultMapperFactory } from '@volar/language-service';
import type { DocumentsAndMap } from '@volar/language-service/lib/utils/featureWorkers';
import { baseParse } from '@vue/language-plugin-pug/lib';
import type * as html from 'vscode-html-languageservice';
import { TextDocument } from 'vscode-languageserver-textdocument';

export interface PugDocument extends ReturnType<ReturnType<typeof register>> {}

export function register(htmlLs: html.LanguageService) {
	return (pugCode: string) => {
		const parsed = baseParse(pugCode);
		const htmlTextDocument = TextDocument.create('foo.html', 'html', 0, parsed.htmlCode);
		const htmlDocument = htmlLs.parseHTMLDocument(htmlTextDocument);
		const docs: DocumentsAndMap = [
			parsed.pugTextDocument,
			htmlTextDocument,
			defaultMapperFactory(parsed.mappings),
		];

		return {
			...parsed,
			htmlDocument,
			docs,
		};
	};
}
