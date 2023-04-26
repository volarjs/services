import { SharedContext } from '../types';
import * as vscode from 'vscode-languageserver-protocol';
import { safeCall } from '../shared';

export function register(ctx: SharedContext) {
	const { ts } = ctx;

	return (uri: string, position: vscode.Position): vscode.DocumentHighlight[] => {

		const document = ctx.getTextDocument(uri);
		if (!document) return [];

		const fileName = ctx.env.uriToFileName(document.uri);
		const offset = document.offsetAt(position);
		const highlights = safeCall(() => ctx.typescript.languageService.getDocumentHighlights(fileName, offset, [fileName]));
		if (!highlights) return [];

		const results: vscode.DocumentHighlight[] = [];

		for (const highlight of highlights) {
			for (const span of highlight.highlightSpans) {
				results.push({
					kind: span.kind === ts.HighlightSpanKind.writtenReference ? vscode.DocumentHighlightKind.Write : vscode.DocumentHighlightKind.Read,
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
