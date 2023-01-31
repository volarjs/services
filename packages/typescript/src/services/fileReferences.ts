import type * as ts from 'typescript/lib/tsserverlibrary';
import * as vscode from 'vscode-languageserver-protocol';
import { entriesToLocations } from '../utils/transforms';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { Shared } from '../createLanguageService';

export function register(
	languageService: ts.LanguageService,
	getTextDocument: (uri: string) => TextDocument | undefined,
	shared: Shared,
) {
	return (uri: string): vscode.Location[] => {
		const document = getTextDocument(uri);
		if (!document) return [];

		const fileName = shared.uriToFileName(document.uri);

		let entries: ReturnType<typeof languageService.getFileReferences> | undefined;
		try { entries = languageService.getFileReferences(fileName); } catch { }
		if (!entries) return [];

		return entriesToLocations([...entries], getTextDocument, shared);
	};
}
