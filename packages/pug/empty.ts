import type { LanguageServicePlugin } from '@volar/language-service';

console.warn('volar-service-pug: this module is not yet supported for web.');

export function create(): LanguageServicePlugin {
	return {
		name: 'pug (stub)',
		create() {
			return {};
		},
	};
}
