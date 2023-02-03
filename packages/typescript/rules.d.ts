import type * as ts from 'typescript/lib/tsserverlibrary';
import type { TextDocument } from 'vscode-languageserver-textdocument';

declare module '@volar/language-service' {
	interface RuleContext {
		typescript?: {
			version: 'alpha',
			sourceFile: ts.SourceFile;
			getTextDocument(uri: string): TextDocument | undefined;
			module: typeof ts;
			languageService: ts.LanguageService;
			languageServiceHost: ts.LanguageServiceHost;
		}
	}
}
