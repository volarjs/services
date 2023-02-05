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
	return (uri: string, position: vscode.Position): vscode.Location[] => {
		const document = getTextDocument(uri);
		if (!document) return [];

		const fileName = ctx.uriToFileName(document.uri);
		const offset = document.offsetAt(position);

		let entries: ReturnType<typeof languageService.getReferencesAtPosition>;
		try { entries = languageService.getReferencesAtPosition(fileName, offset); } catch { }
		if (!entries) return [];

		return entriesToLocations([...entries], getTextDocument, ctx);
	};
}
