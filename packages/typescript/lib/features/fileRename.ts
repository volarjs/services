import type * as vscode from 'vscode-languageserver-protocol';
import { getFormatCodeSettings } from '../configs/getFormatCodeSettings';
import { getUserPreferences } from '../configs/getUserPreferences';
import { safeCall } from '../shared';
import type { SharedContext } from '../types';
import { fileTextChangesToWorkspaceEdit } from './rename';

export function register(ctx: SharedContext) {
	return async (oldUri: string, newUri: string): Promise<vscode.WorkspaceEdit | undefined> => {

		const document = ctx.getTextDocument(oldUri);
		const [formatOptions, preferences] = document ? await Promise.all([
			getFormatCodeSettings(ctx, document),
			getUserPreferences(ctx, document),
		]) : [{}, {}];

		const fileToRename = ctx.uriToFileName(oldUri);
		const newFilePath = ctx.uriToFileName(newUri);
		const response = safeCall(() => ctx.languageService.getEditsForFileRename(fileToRename, newFilePath, formatOptions, preferences));
		if (!response?.length) return;

		const edits = fileTextChangesToWorkspaceEdit(response, ctx);
		return edits;
	};
}
