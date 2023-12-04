import type { ServicePlugin } from '@volar/language-service';

console.warn('volar-service-emmet: this module is not yet supported for web.');

export function create(): ServicePlugin {
	return {
		create() {
			return {};
		},
	};
}

export default create;
