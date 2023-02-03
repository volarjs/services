import * as html from 'vscode-html-languageservice';

declare module '@volar/language-service' {
	interface RuleContext {
		html?: {
			version: 'alpha',
			document: html.HTMLDocument;
			languageService: html.LanguageService;
		}
	}
}
