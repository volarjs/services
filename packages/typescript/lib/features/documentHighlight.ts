import type * as vscode from '@volar/language-service';
import { safeCall } from '../shared';
import type { SharedContext } from '../types';

export function register(ctx: SharedContext) {
	const { ts } = ctx;

	return (uri: string, position: vscode.Position): vscode.DocumentHighlight[] => {

		const document = ctx.getTextDocument(uri);
		if (!document) return [];

		const fileName = ctx.uriToFileName(document.uri);
		const offset = document.offsetAt(position);
		const highlights = safeCall(() => ctx.languageService.getDocumentHighlights(fileName, offset, [fileName]));
		if (!highlights) return [];

		const results: vscode.DocumentHighlight[] = [];

		for (const highlight of highlights) {
			for (const span of highlight.highlightSpans) {
				results.push({
					kind: span.kind === ts.HighlightSpanKind.writtenReference ? 3 satisfies typeof vscode.DocumentHighlightKind.Write : 2 satisfies typeof vscode.DocumentHighlightKind.Read,
					range: {
						start: document.positionAt(span.textSpan.start),
						end: document.positionAt(span.textSpan.start + span.textSpan.length),
					},
				});
			}
		}

		return results;
	};
}
