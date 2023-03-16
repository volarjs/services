import * as vscode from 'vscode-languageserver-protocol';
import { fileTextChangesToWorkspaceEdit } from './rename';
import { Data, FixAllData, RefactorData } from './codeAction';
import { getFormatCodeSettings } from '../configs/getFormatCodeSettings';
import { getUserPreferences } from '../configs/getUserPreferences';
import { SharedContext } from '../types';
import { safeCall } from '../shared';
import { TextDocument } from 'vscode-languageserver-textdocument';

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
	const sourceFile = ctx.typescript.languageService.getProgram()!.getSourceFile(data.fileName)!;
	const patchedEdits = editInfo.edits.map(edit => {
		if (edit.fileName !== data.fileName) return edit;
		return {
			...edit,
			textChanges: edit.textChanges.map((change) => {
				const { newText, span } = change;
				if (isNodeWithinBlock(ctx, sourceFile, change.span.start)) return change;
				return {
					newText: newText.split('\n').map(line => line.replace(/^\t/, '')).join('\n'),
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

function isNodeWithinBlock(ctx: SharedContext, sourceFile: ts.SourceFile, position: number): boolean | undefined {
	const ts = ctx.typescript.module;
	function find(node: ts.Node): boolean | undefined {
		if (position >= node.getStart() && position <= node.getEnd()) {
			if (ts.isBlock(node)) {
				const ignoreBlock = ts.findAncestor(node.parent, (n) => ts.isBlock(n) ? 'quit' : ts.isExportAssignment(n) || (
					ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === '__VLS_setup'
				));
				if (!ignoreBlock) return true;
			}
			return ts.forEachChild(node, find);
		}

		return;
	}
	return find(sourceFile);
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
