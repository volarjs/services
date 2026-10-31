import { defaultMapperFactory } from '@volar/language-service';
import type { DocumentsAndMap } from '@volar/language-service/lib/utils/featureWorkers';
import { compile } from 'muggle-pug';
import type * as html from 'vscode-html-languageservice';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { buildHTML } from './pugMappings';

export interface PugDocument extends ReturnType<ReturnType<typeof register>> {}

export function register(htmlLs: html.LanguageService) {
	return (pugCode: string) => {
		const { pieces, ...compiled } = compile(pugCode);
		const { html, mappings } = buildHTML(pugCode, pieces);
		const pugTextDocument = TextDocument.create('file:///file.pug', 'pug', 0, pugCode);
		const htmlTextDocument = TextDocument.create('foo.html', 'html', 0, html);
		const htmlDocument = htmlLs.parseHTMLDocument(htmlTextDocument);
		const docs: DocumentsAndMap = [
			pugTextDocument,
			htmlTextDocument,
			defaultMapperFactory(mappings),
		];

		return {
			...compiled,
			pugTextDocument,
			htmlDocument,
			docs,
		};
	};
}
