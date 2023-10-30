import type * as ts from 'typescript/lib/tsserverlibrary';
import type * as vscode from '@volar/language-service';
import * as path from 'path-browserify';
import { renameInfoOptions } from './prepareRename';
import { getFormatCodeSettings } from '../configs/getFormatCodeSettings';
import { getUserPreferences } from '../configs/getUserPreferences';
import { SharedContext } from '../types';
import { safeCall } from '../shared';

export function register(ctx: SharedContext) {

	return async (uri: string, position: vscode.Position, newName: string): Promise<vscode.WorkspaceEdit | undefined> => {
		const document = ctx.getTextDocument(uri);
		if (!document) return;

		const fileName = ctx.env.uriToFileName(document.uri);
		const offset = document.offsetAt(position);
		const renameInfo = safeCall(() => ctx.typescript.languageService.getRenameInfo(fileName, offset, renameInfoOptions));
		if (!renameInfo?.canRename) return;

		if (renameInfo.fileToRename) {
			const [formatOptions, preferences] = await Promise.all([
				getFormatCodeSettings(ctx, document),
				getUserPreferences(ctx, document),
			]);
			return renameFile(renameInfo.fileToRename, newName, formatOptions, preferences);
		}

		const { providePrefixAndSuffixTextForRename } = await getUserPreferences(ctx, document);
		const entries = ctx.typescript.languageService.findRenameLocations(fileName, offset, false, false, providePrefixAndSuffixTextForRename);
		if (!entries)
			return;

		const locations = locationsToWorkspaceEdit(newName, entries, ctx);
		return locations;
	};

	function renameFile(
		fileToRename: string,
		newName: string,
		formatOptions: ts.FormatCodeSettings,
		preferences: ts.UserPreferences,
	): vscode.WorkspaceEdit | undefined {
		// Make sure we preserve file extension if none provided
		if (!path.extname(newName)) {
			newName += path.extname(fileToRename);
		}

		const dirname = path.dirname(fileToRename);
		const newFilePath = path.join(dirname, newName);

		const response = ctx.typescript.languageService.getEditsForFileRename(fileToRename, newFilePath, formatOptions, preferences);
		const edits = fileTextChangesToWorkspaceEdit(response, ctx);
		if (!edits.documentChanges) {
			edits.documentChanges = [];
		}

		edits.documentChanges.push({
			kind: 'rename',
			oldUri: ctx.env.fileNameToUri(fileToRename),
			newUri: ctx.env.fileNameToUri(newFilePath),
		});

		return edits;
	}
}

export function fileTextChangesToWorkspaceEdit(
	changes: readonly ts.FileTextChanges[],
	ctx: SharedContext,
) {
	const workspaceEdit: vscode.WorkspaceEdit = {};

	for (const change of changes) {

		if (!workspaceEdit.documentChanges) {
			workspaceEdit.documentChanges = [];
		}

		const uri = ctx.env.fileNameToUri(change.fileName);
		let doc = ctx.getTextDocument(uri);

		if (change.isNewFile) {
			workspaceEdit.documentChanges.push({ kind: 'create', uri });
		}

		if (!doc && !change.isNewFile)
			continue;

		const docEdit: vscode.TextDocumentEdit = {
			textDocument: {
				uri,
				version: null, // fix https://github.com/johnsoncodehk/volar/issues/2025
			},
			edits: [],
		};

		for (const textChange of change.textChanges) {
			docEdit.edits.push({
				newText: textChange.newText,
				range: {
					start: doc?.positionAt(textChange.span.start) ?? { line: 0, character: 0 },
					end: doc?.positionAt(textChange.span.start + textChange.span.length) ?? { line: 0, character: 0 },
				},
			});
		}
		workspaceEdit.documentChanges.push(docEdit);
	}

	return workspaceEdit;
}
function locationsToWorkspaceEdit(
	newText: string,
	locations: readonly ts.RenameLocation[],
	ctx: SharedContext,
) {
	const workspaceEdit: vscode.WorkspaceEdit = {};

	for (const location of locations) {

		if (!workspaceEdit.changes) {
			workspaceEdit.changes = {};
		}

		const uri = ctx.env.fileNameToUri(location.fileName);
		const doc = ctx.getTextDocument(uri);
		if (!doc) continue;

		if (!workspaceEdit.changes[uri]) {
			workspaceEdit.changes[uri] = [];
		}

		let _newText = newText;
		if (location.prefixText)
			_newText = location.prefixText + _newText;
		if (location.suffixText)
			_newText = _newText + location.suffixText;

		workspaceEdit.changes[uri].push({
			newText: _newText,
			range: {
				start: doc.positionAt(location.textSpan.start),
				end: doc.positionAt(location.textSpan.start + location.textSpan.length),
			},
		});
	}

	return workspaceEdit;
}
