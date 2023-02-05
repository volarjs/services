import type * as ts from 'typescript/lib/tsserverlibrary';
import * as vscode from 'vscode-languageserver-protocol';
import { entriesToLocations } from '../utils/transforms';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { LanguageServicePluginContext } from '@volar/language-service';

export function register(
	languageService: ts.LanguageService,
	getTextDocument: (uri: string) => TextDocument | undefined,
	ctx: LanguageServicePluginContext,
) {
	return (uri: string): vscode.Location[] => {
		const document = getTextDocument(uri);
		if (!document) return [];

		const fileName = ctx.uriToFileName(document.uri);

		let entries: ReturnType<typeof languageService.getFileReferences> | undefined;
		try { entries = languageService.getFileReferences(fileName); } catch { }
		if (!entries) return [];

		return entriesToLocations([...entries], getTextDocument, ctx);
	};
}
