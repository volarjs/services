import type { Service } from '@volar/language-service';
import { formatDiagnostic } from 'pretty-ts-errors-lsp';

export default (format: (text: string) => string): Service => (contextOrNull): ReturnType<Service> => {

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
