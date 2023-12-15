import type * as vscode from '@volar/language-service';
import type * as ts from 'typescript/lib/tsserverlibrary';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { safeCall } from '../shared';
import type { SharedContext } from '../types';

export function register(ctx: SharedContext) {
	return (uri: string, positions: vscode.Position[]): vscode.SelectionRange[] => {

		const document = ctx.getTextDocument(uri);
		if (!document) return [];

		const result: vscode.SelectionRange[] = [];

		for (const position of positions) {
			const fileName = ctx.env.uriToFileName(document.uri);
			const offset = document.offsetAt(position);
			const range = safeCall(() => ctx.typescript.languageService.getSmartSelectionRange(fileName, offset));
			if (!range) continue;

			result.push(transformSelectionRange(range, document));
		}

		return result;
	};
}

function transformSelectionRange(range: ts.SelectionRange, document: TextDocument): vscode.SelectionRange {
	return {
		range: {
			start: document.positionAt(range.textSpan.start),
			end: document.positionAt(range.textSpan.start + range.textSpan.length),
		},
		parent: range.parent ? transformSelectionRange(range.parent, document) : undefined,
	};
}
