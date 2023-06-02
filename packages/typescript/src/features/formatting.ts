import type * as vscode from '@volar/language-service';
import { getFormatCodeSettings } from '../configs/getFormatCodeSettings';
import { safeCall } from '../shared';
import { SharedContext } from '../types';
import type { TextDocument } from 'vscode-languageserver-textdocument';

export function register(ctx: SharedContext) {
	return {
		onRange: async (document: TextDocument, range: vscode.Range | undefined, options: vscode.FormattingOptions): Promise<vscode.TextEdit[]> => {

			const fileName = ctx.env.uriToFileName(document.uri);
			const tsOptions = await getFormatCodeSettings(ctx, document, options);
			if (typeof (tsOptions.indentSize) === "boolean" || typeof (tsOptions.indentSize) === "string") {
				tsOptions.indentSize = undefined;
			}

			const scriptEdits = range
				? safeCall(() => ctx.typescript.languageService.getFormattingEditsForRange(fileName, document.offsetAt(range.start), document.offsetAt(range.end), tsOptions))
				: safeCall(() => ctx.typescript.languageService.getFormattingEditsForDocument(fileName, tsOptions));
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

			const fileName = ctx.env.uriToFileName(document.uri);
			const tsOptions = await getFormatCodeSettings(ctx, document, options);
			const scriptEdits = safeCall(() => ctx.typescript.languageService.getFormattingEditsAfterKeystroke(fileName, document.offsetAt(position), key, tsOptions));
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
