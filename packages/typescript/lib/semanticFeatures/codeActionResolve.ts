import type * as vscode from '@volar/language-service';
import type * as ts from 'typescript';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { getFormatCodeSettings } from '../configs/getFormatCodeSettings';
import { getUserPreferences } from '../configs/getUserPreferences';
import { safeCall } from '../shared';
import type { SharedContext } from './types';
import type { Data, FixAllData, RefactorData } from './codeAction';
import { convertFileTextChanges } from '../utils/lspConverters';
import { URI } from 'vscode-uri';

export function register(ctx: SharedContext) {
	return async (codeAction: vscode.CodeAction, formattingOptions: vscode.FormattingOptions | undefined) => {

		const data: Data = codeAction.data;
		const document = ctx.getTextDocument(URI.parse(data.uri))!;
		const [formatOptions, preferences] = await Promise.all([
			getFormatCodeSettings(ctx, document, formattingOptions),
			getUserPreferences(ctx, document),
		]);

		if (data?.type === 'fixAll') {
			resolveFixAllCodeAction(ctx, codeAction, data, formatOptions, preferences);
		}
		else if (data?.type === 'refactor') {
			resolveRefactorCodeAction(ctx, codeAction, data, document, formatOptions, preferences);
		}
		else if (data?.type === 'organizeImports') {
			resolveOrganizeImportsCodeAction(ctx, codeAction, data, formatOptions, preferences);
		}

		return codeAction;
	};
}

export function resolveFixAllCodeAction(
	ctx: SharedContext,
	codeAction: vscode.CodeAction,
	data: FixAllData,
	formatOptions: ts.FormatCodeSettings,
	preferences: ts.UserPreferences
) {
	const fixes = data.fixIds.map(fixId => safeCall(() => ctx.languageService.getCombinedCodeFix({ type: 'file', fileName: data.fileName }, fixId, formatOptions, preferences)));
	const changes = fixes.map(fix => fix?.changes ?? []).flat();
	codeAction.edit = convertFileTextChanges(changes, ctx.fileNameToUri, ctx.getTextDocument);
}

export function resolveRefactorCodeAction(
	ctx: SharedContext,
	codeAction: vscode.CodeAction,
	data: RefactorData,
	document: TextDocument,
	formatOptions: ts.FormatCodeSettings,
	preferences: ts.UserPreferences
) {
	const editInfo = safeCall(() => ctx.languageService.getEditsForRefactor(data.fileName, formatOptions, data.range, data.refactorName, data.actionName, preferences));
	if (!editInfo) {
		return;
	}
	codeAction.edit = convertFileTextChanges(editInfo.edits, ctx.fileNameToUri, ctx.getTextDocument);
	if (editInfo.renameLocation !== undefined && editInfo.renameFilename !== undefined) {
		codeAction.command = ctx.commands.rename.create(
			document.uri,
			document.positionAt(editInfo.renameLocation)
		);
	}
}

export function resolveOrganizeImportsCodeAction(
	ctx: SharedContext,
	codeAction: vscode.CodeAction,
	data: Data,
	formatOptions: ts.FormatCodeSettings,
	preferences: ts.UserPreferences
) {
	const changes = safeCall(() => ctx.languageService.organizeImports({ type: 'file', fileName: data.fileName }, formatOptions, preferences));
	codeAction.edit = convertFileTextChanges(changes ?? [], ctx.fileNameToUri, ctx.getTextDocument);
}
