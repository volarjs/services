import * as pug from '@volar-plugins/pug';

declare module '@volar/language-service' {
	interface RuleContext {
		pug?: {
			rootNode: pug.Node;
			languageService: pug.LanguageService;
		}
	}
}
