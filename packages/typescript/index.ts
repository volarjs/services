export { Provide } from './lib/plugins/semantic';

import { create as createDirectiveCommentServicePlugin } from './lib/plugins/directiveComment';
import { create as createDocCommentTemplateServicePlugin } from './lib/plugins/docCommentTemplate';
import { create as createSemanticServicePlugin } from './lib/plugins/semantic';
import { create as createSyntacticServicePlugin } from './lib/plugins/syntactic';

export function create(
	ts: typeof import('typescript'),
	options?: Parameters<typeof createSemanticServicePlugin>[1] & Parameters<typeof createSyntacticServicePlugin>[1]
) {
	return [
		createSemanticServicePlugin(ts, options),
		createSyntacticServicePlugin(ts, options),
		createDocCommentTemplateServicePlugin(ts),
		createDirectiveCommentServicePlugin(),
	];
}
