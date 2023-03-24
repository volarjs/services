import type * as ts from 'typescript/lib/tsserverlibrary';
import * as vscode from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getFormatCodeSettings } from '../configs/getFormatCodeSettings';
import { getUserPreferences } from '../configs/getUserPreferences';
import { safeCall } from '../shared';
import { SharedContext } from '../types';
import { Data, FixAllData, RefactorData } from './codeAction';
import { fileTextChangesToWorkspaceEdit } from './rename';

export function register(ctx: SharedContext) {
	return async (codeAction: vscode.CodeAction) => {

		const data: Data = codeAction.data;
		const document = ctx.getTextDocument(data.uri);
		const [formatOptions, preferences] = document ? await Promise.all([
			getFormatCodeSettings(ctx, document),
			getUserPreferences(ctx, document),
		]) : [{}, {}];

		if (data?.type === 'fixAll') {
			resolveFixAllCodeAction(ctx, codeAction, data, formatOptions, preferences);
		}
		else if (data?.type === 'refactor' && document) {
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
	preferences: ts.UserPreferences,
) {
	const fixes = data.fixIds.map(fixId => safeCall(() => ctx.typescript.languageService.getCombinedCodeFix({ type: 'file', fileName: data.fileName }, fixId, formatOptions, preferences)));
	const changes = fixes.map(fix => fix?.changes ?? []).flat();
	codeAction.edit = fileTextChangesToWorkspaceEdit(changes, ctx);
}

export function resolveRefactorCodeAction(
	ctx: SharedContext,
	codeAction: vscode.CodeAction,
	data: RefactorData,
	document: TextDocument,
	formatOptions: ts.FormatCodeSettings,
	preferences: ts.UserPreferences,
) {
	const editInfo = safeCall(() => ctx.typescript.languageService.getEditsForRefactor(data.fileName, formatOptions, data.range, data.refactorName, data.actionName, preferences));
	if (!editInfo) {
		return;
	}
	const fullText = document.getText();
	const inferredWhitespaces = document.getText().match(/^[ \t]+/m)?.[0] ?? '\t';
	const patchedEdits = editInfo.edits.map(edit => {
		if (edit.fileName !== data.fileName) return edit;
		return {
			...edit,
			textChanges: edit.textChanges.map((change) => {
				let { newText, span } = change;
				const changePos = document.positionAt(span.start);
				const startLineOffset = document.offsetAt({
					line: changePos.line,
					character: 0,
				});
				if (!/^\s/.test(fullText.slice(startLineOffset)) && newText.split('\n')[0].startsWith('\t')) {
					newText = newText.split('\n').map(line => line.replace(/^\t/, '')).join('\n');
				}
				// patch renameLocation for extract symbol actions (first line only)
				if (
					editInfo.renameLocation &&
					ctx.typescript.module.textSpanContainsPosition({
						start: change.span.start,
						length: newText.length,
					}, editInfo.renameLocation)
				) {
					const leadingWhitespaceLenDiff = inferredWhitespaces.length - 1;
					editInfo.renameLocation += (newText.split('\n')[0].match(/\t/g)?.length ?? 0) * leadingWhitespaceLenDiff;
				}
				return {
					newText: newText.replaceAll('\t', inferredWhitespaces),
					span
				};
			})
		};
	});

	codeAction.edit = fileTextChangesToWorkspaceEdit(patchedEdits, ctx);
	if (editInfo.renameLocation !== undefined && editInfo.renameFilename !== undefined) {
		codeAction.command = ctx.commands.createRenameCommand(
			document.uri,
			document.positionAt(editInfo.renameLocation),
		);
	}
}

export function resolveOrganizeImportsCodeAction(
	ctx: SharedContext,
	codeAction: vscode.CodeAction,
	data: Data,
	formatOptions: ts.FormatCodeSettings,
	preferences: ts.UserPreferences,
) {
	const changes = safeCall(() => ctx.typescript.languageService.organizeImports({ type: 'file', fileName: data.fileName }, formatOptions, preferences));
	codeAction.edit = fileTextChangesToWorkspaceEdit(changes ?? [], ctx);
}
