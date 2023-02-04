import * as css from 'vscode-css-languageservice';

declare module '@volar/language-service' {
	interface RuleContext {
		css?: {
			stylesheet: css.Stylesheet;
			languageService: css.LanguageService;
		}
	}
}
