import type { LanguageServicePlugin } from '@volar/language-service';

console.warn('volar-service-emmet: this module is not yet supported for web.');

export function create(): LanguageServicePlugin {
	return {
		name: 'emmet (stub)',
		create() {
			return {};
		},
	};
}
