import type * as ts from 'typescript/lib/tsserverlibrary';
import type * as vscode from 'vscode-languageserver-protocol';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { fileTextChangesToWorkspaceEdit } from './rename';
import { getFormatCodeSettings } from '../configs/getFormatCodeSettings';
import { getUserPreferences } from '../configs/getUserPreferences';
import type { LanguageServicePluginContext } from '@volar/language-service';

export function register(
	languageService: ts.LanguageService,
	getTextDocument: (uri: string) => TextDocument | undefined,
	ctx: LanguageServicePluginContext,
) {
	return async (oldUri: string, newUri: string): Promise<vscode.WorkspaceEdit | undefined> => {

		const document = getTextDocument(oldUri);
		const [formatOptions, preferences] = document ? await Promise.all([
			getFormatCodeSettings(ctx, document.uri),
			getUserPreferences(ctx, document.uri),
		]) : [{}, {}];

		const fileToRename = ctx.uriToFileName(oldUri);
		const newFilePath = ctx.uriToFileName(newUri);

		let response: ReturnType<typeof languageService.getEditsForFileRename> | undefined;
		try { response = languageService.getEditsForFileRename(fileToRename, newFilePath, formatOptions, preferences); } catch { }
		if (!response?.length) return;

		const edits = fileTextChangesToWorkspaceEdit(response, getTextDocument, ctx);
		return edits;
	};
}
