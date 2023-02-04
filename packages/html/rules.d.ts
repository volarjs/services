import * as html from 'vscode-html-languageservice';

declare module '@volar/language-service' {
	interface RuleContext {
		html?: {
			document: html.HTMLDocument;
			languageService: html.LanguageService;
		}
	}
}
