import type * as ts from 'typescript/lib/tsserverlibrary';
import * as vscode from 'vscode-languageserver-protocol';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { fileTextChangesToWorkspaceEdit } from './rename';
import { Data } from './codeAction';
import { getFormatCodeSettings } from '../configs/getFormatCodeSettings';
import { getUserPreferences } from '../configs/getUserPreferences';
import type { LanguageServicePluginContext } from '@volar/language-service';

export function register(
	languageService: ts.LanguageService,
	getTextDocument: (uri: string) => TextDocument | undefined,
	ctx: LanguageServicePluginContext,
) {
	return async (codeAction: vscode.CodeAction) => {

		const data: Data = codeAction.data;
		const document = getTextDocument(data.uri);
		const [formatOptions, preferences] = document ? await Promise.all([
			getFormatCodeSettings(ctx, document),
			getUserPreferences(ctx, document),
		]) : [{}, {}];

		if (data?.type === 'fixAll') {
			const fixes = data.fixIds.map(fixId => {
				try {
					return languageService.getCombinedCodeFix({ type: 'file', fileName: data.fileName }, fixId, formatOptions, preferences);
				} catch { }
			});
			const changes = fixes.map(fix => fix?.changes ?? []).flat();
			codeAction.edit = fileTextChangesToWorkspaceEdit(changes, getTextDocument, ctx);
		}
		else if (data?.type === 'refactor') {
			const editInfo = languageService.getEditsForRefactor(data.fileName, formatOptions, data.range, data.refactorName, data.actionName, preferences);
			if (editInfo) {
				const edit = fileTextChangesToWorkspaceEdit(editInfo.edits, getTextDocument, ctx);
				codeAction.edit = edit;
			}
		}
		else if (data?.type === 'organizeImports') {
			const changes = languageService.organizeImports({ type: 'file', fileName: data.fileName }, formatOptions, preferences);
			const edit = fileTextChangesToWorkspaceEdit(changes, getTextDocument, ctx);
			codeAction.edit = edit;
		}

		return codeAction;
	};
}
