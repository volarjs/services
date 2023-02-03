import * as json from 'vscode-json-languageservice';

declare module '@volar/language-service' {
	interface RuleContext {
		json?: {
			version: 'alpha',
			document: json.JSONDocument;
			languageService: json.LanguageService;
		}
	}
}
