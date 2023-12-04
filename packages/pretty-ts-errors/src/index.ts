import type { Service, ServicePlugin } from '@volar/language-service';
import { formatDiagnostic } from 'pretty-ts-errors-lsp';

export function create(format: (text: string) => string): ServicePlugin {
	return {
		create(): Service {
			return {
				provideDiagnosticMarkupContent(diagnostic) {
					return {
						kind: 'markdown',
						value: formatDiagnostic(diagnostic, format),
					};
				},
			};
		},
	};
}
