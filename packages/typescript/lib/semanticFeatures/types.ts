import type { ServiceContext } from '@volar/language-service';
import type * as ts from 'typescript';
import type { TextDocument } from 'vscode-languageserver-textdocument';

export type SharedContext = ServiceContext & {
	languageServiceHost: ts.LanguageServiceHost;
	languageService: ts.LanguageService;
	getTextDocument: (uri: string) => TextDocument;
	uriToFileName: (uri: string) => string;
	fileNameToUri: (fileName: string) => string;
};
