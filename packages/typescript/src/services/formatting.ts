import * as vscode from 'vscode-languageserver-protocol';
import { getFormatCodeSettings } from '../configs/getFormatCodeSettings';
import { safeCall } from '../shared';
import { SharedContext } from '../types';

export function register(ctx: SharedContext) {
	return {
		onRange: async (uri: string, range: vscode.Range | undefined, options: vscode.FormattingOptions): Promise<vscode.TextEdit[]> => {

			const document = ctx.getTextDocument(uri);
			if (!document) return [];

			const fileName = ctx.uriToFileName(document.uri);
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
		onType: async (uri: string, options: vscode.FormattingOptions, position: vscode.Position, key: string): Promise<vscode.TextEdit[]> => {

			const document = ctx.getTextDocument(uri);
			if (!document) return [];

			const fileName = ctx.uriToFileName(document.uri);
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
