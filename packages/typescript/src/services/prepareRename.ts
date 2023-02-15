import { SharedContext } from '../types';
import * as vscode from 'vscode-languageserver-protocol';
import { safeCall } from '../shared';

/* typescript-language-features is hardcode true */
export const renameInfoOptions = { allowRenameOfImportPath: true };

export function register(ctx: SharedContext) {
	return (uri: string, position: vscode.Position): vscode.Range | undefined | vscode.ResponseError<void> => {
		const document = ctx.getTextDocument(uri);
		if (!document) return;

		const fileName = ctx.uriToFileName(document.uri);
		const offset = document.offsetAt(position);
		const renameInfo = safeCall(() => ctx.typescript.languageService.getRenameInfo(fileName, offset, renameInfoOptions));
		if (!renameInfo) return;

		if (!renameInfo.canRename) {
			return new vscode.ResponseError(0, renameInfo.localizedErrorMessage);
		}

		return {
			start: document.positionAt(renameInfo.triggerSpan.start),
			end: document.positionAt(renameInfo.triggerSpan.start + renameInfo.triggerSpan.length),
		};
	};
}
