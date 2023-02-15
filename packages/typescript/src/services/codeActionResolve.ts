import * as vscode from 'vscode-languageserver-protocol';
import { fileTextChangesToWorkspaceEdit } from './rename';
import { Data } from './codeAction';
import { getFormatCodeSettings } from '../configs/getFormatCodeSettings';
import { getUserPreferences } from '../configs/getUserPreferences';
import { SharedContext } from '../types';
import { safeCall } from '../shared';

export function register(ctx: SharedContext) {
	return async (codeAction: vscode.CodeAction) => {

		const data: Data = codeAction.data;
		const document = ctx.getTextDocument(data.uri);
		const [formatOptions, preferences] = document ? await Promise.all([
			getFormatCodeSettings(ctx, document),
			getUserPreferences(ctx, document),
		]) : [{}, {}];

		if (data?.type === 'fixAll') {
			const fixes = data.fixIds.map(fixId => {
				return safeCall(() => ctx.typescript.languageService.getCombinedCodeFix({ type: 'file', fileName: data.fileName }, fixId, formatOptions, preferences));
			});
			const changes = fixes.map(fix => fix?.changes ?? []).flat();
			codeAction.edit = fileTextChangesToWorkspaceEdit(changes, ctx);
		}
		else if (data?.type === 'refactor') {
			const editInfo = ctx.typescript.languageService.getEditsForRefactor(data.fileName, formatOptions, data.range, data.refactorName, data.actionName, preferences);
			if (editInfo) {
				const edit = fileTextChangesToWorkspaceEdit(editInfo.edits, ctx);
				codeAction.edit = edit;
			}
		}
		else if (data?.type === 'organizeImports') {
			const changes = ctx.typescript.languageService.organizeImports({ type: 'file', fileName: data.fileName }, formatOptions, preferences);
			const edit = fileTextChangesToWorkspaceEdit(changes, ctx);
			codeAction.edit = edit;
		}

		return codeAction;
	};
}
