import type { ServicePlugin } from '@volar/language-service';

console.warn('volar-service-pug: this module is not yet supported for web.');

export function create(): ServicePlugin {
	return {
		create() {
			return {};
		},
	};
}

export default create;
