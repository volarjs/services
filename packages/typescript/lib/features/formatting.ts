import type * as vscode from '@volar/language-service';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { getFormatCodeSettings } from '../configs/getFormatCodeSettings';
import { safeCall } from '../shared';
import type { SharedContext } from '../types';

export function register(ctx: SharedContext) {
	return {
		onRange: async (document: TextDocument, range: vscode.Range | undefined, options: vscode.FormattingOptions): Promise<vscode.TextEdit[]> => {

			const fileName = ctx.uriToFileName(document.uri);
			const tsOptions = await getFormatCodeSettings(ctx, document, options);
			if (typeof (tsOptions.indentSize) === "boolean" || typeof (tsOptions.indentSize) === "string") {
				tsOptions.indentSize = undefined;
			}

			const scriptEdits = range
				? safeCall(() => ctx.languageService.getFormattingEditsForRange(fileName, document.offsetAt(range.start), document.offsetAt(range.end), tsOptions))
				: safeCall(() => ctx.languageService.getFormattingEditsForDocument(fileName, tsOptions));
			if (!scriptEdits) return [];

			const result: vscode.TextEdit[] = [];

			for (const textEdit of scriptEdits) {
				result.push({
					range: {
						start: document.positionAt(textEdit.span.start),
						end: document.positionAt(textEdit.span.start + textEdit.span.length),
					},
					newText: textEdit.newText,
				});
			}

			return result;
		},
		onType: async (document: TextDocument, options: vscode.FormattingOptions, position: vscode.Position, key: string): Promise<vscode.TextEdit[]> => {

			const fileName = ctx.uriToFileName(document.uri);
			const tsOptions = await getFormatCodeSettings(ctx, document, options);
			const scriptEdits = safeCall(() => ctx.languageService.getFormattingEditsAfterKeystroke(fileName, document.offsetAt(position), key, tsOptions));
			if (!scriptEdits) return [];

			const result: vscode.TextEdit[] = [];

			for (const textEdit of scriptEdits) {
				result.push({
					range: {
						start: document.positionAt(textEdit.span.start),
						end: document.positionAt(textEdit.span.start + textEdit.span.length),
					},
					newText: textEdit.newText,
				});
			}

			return result;
		},
	};
}
