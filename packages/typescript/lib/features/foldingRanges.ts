import type * as vscode from '@volar/language-service';
import type * as ts from 'typescript';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { safeCall } from '../shared';
import type { SharedContext } from '../types';

export function register(ctx: SharedContext) {
	const { ts } = ctx;

	return (uri: string) => {

		const document = ctx.getTextDocument(uri);
		if (!document) return [];

		const fileName = ctx.env.uriToFileName(document.uri);
		const outliningSpans = safeCall(() => ctx.typescript.languageService.getOutliningSpans(fileName));
		if (!outliningSpans) return [];

		const foldingRanges: vscode.FoldingRange[] = [];

		for (const outliningSpan of outliningSpans) {

			const start = document.positionAt(outliningSpan.textSpan.start);
			const end = adjustFoldingEnd(start, document.positionAt(outliningSpan.textSpan.start + outliningSpan.textSpan.length), document);

			const foldingRange: vscode.FoldingRange = {
				startLine: start.line,
				endLine: end.line,
				startCharacter: start.character,
				endCharacter: end.character,
				kind: transformFoldingRangeKind(outliningSpan.kind),
			};
			foldingRanges.push(foldingRange);
		}

		return foldingRanges;
	};

	function transformFoldingRangeKind(tsKind: ts.OutliningSpanKind) {
		switch (tsKind) {
			case ts.OutliningSpanKind.Comment: return 'comment' satisfies typeof vscode.FoldingRangeKind.Comment;
			case ts.OutliningSpanKind.Imports: return 'imports' satisfies typeof vscode.FoldingRangeKind.Imports;
			case ts.OutliningSpanKind.Region: return 'region' satisfies typeof vscode.FoldingRangeKind.Region;
		}
	}
}

const foldEndPairCharacters = ['}', ']', ')', '`'];

// https://github.com/microsoft/vscode/blob/bed61166fb604e519e82e4d1d1ed839bc45d65f8/extensions/typescript-language-features/src/languageFeatures/folding.ts#L61-L73
function adjustFoldingEnd(start: vscode.Position, end: vscode.Position, document: TextDocument) {
	// workaround for #47240
	if (end.character > 0) {
		const foldEndCharacter = document.getText({
			start: { line: end.line, character: end.character - 1 },
			end,
		});
		if (foldEndPairCharacters.includes(foldEndCharacter)) {
			const endOffset = Math.max(document.offsetAt({ line: end.line, character: 0 }) - 1, document.offsetAt(start));
			return document.positionAt(endOffset);
		}
	}

	return end;
}
