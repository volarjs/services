import type { Service } from '@volar/language-service';
import { formatDiagnostic } from 'pretty-ts-errors-lsp';

export function create(format: (text: string) => string): Service {
	return (contextOrNull): ReturnType<Service> => {

		if (!contextOrNull) return {};

		return {
			provideDiagnosticMarkupContent(diagnostic) {
				return {
					kind: 'markdown',
					value: formatDiagnostic(diagnostic, format),
				};
			},
		};
	};
}

export default create;
