import type * as vscode from '@volar/language-service';
import { safeCall } from '../shared';
import type { SharedContext } from '../types';

/* typescript-language-features is hardcode true */
export const renameInfoOptions = { allowRenameOfImportPath: true };

export function register(ctx: SharedContext) {
	return (uri: string, position: vscode.Position): vscode.Range | { message: string; } | undefined => {
		const document = ctx.getTextDocument(uri);
		if (!document) return;

		const fileName = ctx.uriToFileName(document.uri);
		const offset = document.offsetAt(position);
		const renameInfo = safeCall(() => ctx.languageService.getRenameInfo(fileName, offset, renameInfoOptions));
		if (!renameInfo) return;

		if (!renameInfo.canRename) {
			return { message: renameInfo.localizedErrorMessage };
		}

		return {
			start: document.positionAt(renameInfo.triggerSpan.start),
			end: document.positionAt(renameInfo.triggerSpan.start + renameInfo.triggerSpan.length),
		};
	};
}
