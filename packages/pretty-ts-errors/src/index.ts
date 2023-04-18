import type { LanguageServicePlugin } from '@volar/language-service';
import { formatDiagnostic } from 'pretty-ts-errors-lsp/out/format/formatDiagnostic';

export default (format: (text: string) => string): LanguageServicePlugin => (contextOrNull): ReturnType<LanguageServicePlugin> => {

	if (!contextOrNull) return {};

	return {
		provideDiagnosticMarkupContent(diagnostic) {
			return formatDiagnostic(diagnostic, format);
		},
	};
};
