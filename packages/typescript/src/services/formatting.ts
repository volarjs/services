import type * as ts from 'typescript/lib/tsserverlibrary';
import * as vscode from 'vscode-languageserver-protocol';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { GetConfiguration, Shared } from '../createLanguageService';
import { getFormatCodeSettings } from '../configs/getFormatCodeSettings';

export function register(
	languageService: ts.LanguageService,
	getTextDocument: (uri: string) => TextDocument | undefined,
	getConfiguration: GetConfiguration,
	shared: Shared,
) {
	return {
		onRange: async (uri: string, range: vscode.Range | undefined, options: vscode.FormattingOptions, tsOptions2: ts.FormatCodeSettings): Promise<vscode.TextEdit[]> => {

			const document = getTextDocument(uri);
			if (!document) return [];

			const fileName = shared.uriToFileName(document.uri);
			const tsOptions: ts.FormatCodeSettings = {
				...await getFormatCodeSettings(getConfiguration, document.uri, options),
				...tsOptions2,
			};
			if (typeof (tsOptions.indentSize) === "boolean" || typeof (tsOptions.indentSize) === "string") {
				tsOptions.indentSize = undefined;
			}

			let scriptEdits: ReturnType<typeof languageService.getFormattingEditsForRange> | undefined;
			try {
				scriptEdits = range
					? languageService.getFormattingEditsForRange(fileName, document.offsetAt(range.start), document.offsetAt(range.end), tsOptions)
					: languageService.getFormattingEditsForDocument(fileName, tsOptions);
			} catch { }
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

			const document = getTextDocument(uri);
			if (!document) return [];

			const fileName = shared.uriToFileName(document.uri);
			const tsOptions = await getFormatCodeSettings(getConfiguration, document.uri, options);

			let scriptEdits: ReturnType<typeof languageService.getFormattingEditsForRange> | undefined;
			try {
				scriptEdits = languageService.getFormattingEditsAfterKeystroke(fileName, document.offsetAt(position), key, tsOptions);
			} catch { }
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
