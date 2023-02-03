import * as pug from './out/languageService';

declare module '@volar/language-service' {
	interface RuleContext {
		pug?: {
			version: 'alpha',
			rootNode: pug.Node;
			languageService: pug.LanguageService;
		}
	}
}
