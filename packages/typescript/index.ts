export * from '@volar/typescript';
export { Provide } from './semantic';

import { create as createDirectiveCommentServicePlugin } from './directiveComment';
import { create as createDocCommentTemplateServicePlugin } from './docCommentTemplate';
import { create as createSemanticServicePlugin } from './semantic';
import { create as createSyntacticServicePlugin } from './syntactic';

export function create(
	ts: typeof import('typescript'),
	options: Parameters<typeof createSemanticServicePlugin>[1] & Parameters<typeof createSyntacticServicePlugin>[1]
) {
	return [
		createSemanticServicePlugin(ts, options),
		createSyntacticServicePlugin(ts, options),
		createDocCommentTemplateServicePlugin(ts),
		createDirectiveCommentServicePlugin(),
	];
}
