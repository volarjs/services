import type { Service } from '@volar/language-service';

console.warn('volar-service-pug: this module is not yet supported for web.');

export function create(): Service {
	return () => ({});
}

export default create;
