import type * as ts from 'typescript/lib/tsserverlibrary';
import type { TextDocument } from 'vscode-languageserver-textdocument';

declare module '@volar/language-service' {
	interface RuleContext {
		typescript?: {
			sourceFile: ts.SourceFile;
			getTextDocument(uri: string): TextDocument | undefined;
			languageService: ts.LanguageService;
			languageServiceHost: ts.LanguageServiceHost;
		}
	}
}
