import type * as ts from 'typescript/lib/tsserverlibrary';
import * as vscode from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { posix as path } from 'path';
import { renameInfoOptions } from './prepareRename';
import type { GetConfiguration, Shared } from '../createLanguageService';
import { URI } from 'vscode-uri';
import { getFormatCodeSettings } from '../configs/getFormatCodeSettings';
import { getUserPreferences } from '../configs/getUserPreferences';

export function register(
	rootUri: URI,
	languageService: ts.LanguageService,
	getTextDocument: (uri: string) => TextDocument | undefined,
	getConfiguration: GetConfiguration,
	shared: Shared,
) {

	return async (uri: string, position: vscode.Position, newName: string): Promise<vscode.WorkspaceEdit | undefined> => {
		const document = getTextDocument(uri);
		if (!document) return;

		const fileName = shared.uriToFileName(document.uri);
		const offset = document.offsetAt(position);

		let renameInfo: ReturnType<typeof languageService.getRenameInfo> | undefined;
		try { renameInfo = languageService.getRenameInfo(fileName, offset, renameInfoOptions); } catch { }
		if (!renameInfo?.canRename) return;

		if (renameInfo.fileToRename) {
			const [formatOptions, preferences] = await Promise.all([
				getFormatCodeSettings(getConfiguration, document.uri),
				getUserPreferences(getConfiguration, document.uri, rootUri),
			]);
			return renameFile(renameInfo.fileToRename, newName, formatOptions, preferences);
		}

		const { providePrefixAndSuffixTextForRename } = await getUserPreferences(getConfiguration, document.uri, rootUri);
		const entries = languageService.findRenameLocations(fileName, offset, false, false, providePrefixAndSuffixTextForRename);
		if (!entries)
			return;

		const locations = locationsToWorkspaceEdit(newName, entries, getTextDocument, shared);
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

		const response = languageService.getEditsForFileRename(fileToRename, newFilePath, formatOptions, preferences);
		const edits = fileTextChangesToWorkspaceEdit(response, getTextDocument, shared);
		if (!edits.documentChanges) {
			edits.documentChanges = [];
		}

		edits.documentChanges.push(vscode.RenameFile.create(
			shared.fileNameToUri(fileToRename),
			shared.fileNameToUri(newFilePath),
		));

		return edits;
	}
}

export function fileTextChangesToWorkspaceEdit(
	changes: readonly ts.FileTextChanges[],
	getTextDocument: (uri: string) => TextDocument | undefined,
	shared: Shared,
) {
	const workspaceEdit: vscode.WorkspaceEdit = {};

	for (const change of changes) {

		if (!workspaceEdit.documentChanges) {
			workspaceEdit.documentChanges = [];
		}

		const uri = shared.fileNameToUri(change.fileName);
		let doc = getTextDocument(uri);

		if (change.isNewFile) {
			workspaceEdit.documentChanges.push(vscode.CreateFile.create(uri));
			doc = TextDocument.create(uri, 'typescript', 0, '');
		}

		if (!doc)
			continue;

		const docEdit = vscode.TextDocumentEdit.create(
			{
				uri,
				version: null, // fix https://github.com/johnsoncodehk/volar/issues/2025
			},
			[],
		);

		for (const textChange of change.textChanges) {
			docEdit.edits.push({
				newText: textChange.newText,
				range: {
					start: doc.positionAt(textChange.span.start),
					end: doc.positionAt(textChange.span.start + textChange.span.length),
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
	getTextDocument: (uri: string) => TextDocument | undefined,
	shared: Shared,
) {
	const workspaceEdit: vscode.WorkspaceEdit = {};

	for (const location of locations) {

		if (!workspaceEdit.changes) {
			workspaceEdit.changes = {};
		}

		const uri = shared.fileNameToUri(location.fileName);
		const doc = getTextDocument(uri);
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