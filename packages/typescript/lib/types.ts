import type { ServiceContext } from '@volar/language-service';
import type * as ts from 'typescript';
import type { TextDocument } from 'vscode-languageserver-textdocument';

export type SharedContext = ServiceContext & {
	typescript: {
		languageServiceHost: ts.LanguageServiceHost;
		languageService: ts.LanguageService;
	};
	ts: typeof import('typescript');
	getTextDocument: (uri: string) => TextDocument | undefined;
};
