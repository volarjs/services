import type * as ts from 'typescript/lib/tsserverlibrary';
import * as vscode from 'vscode-languageserver-protocol';
import { boundSpanToLocationLinks } from '../utils/transforms';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { Shared } from '../createLanguageService';

export function register(
	languageService: ts.LanguageService,
	getTextDocument: (uri: string) => TextDocument | undefined,
	shared: Shared,
) {
	return (uri: string, position: vscode.Position) => {

		const document = getTextDocument(uri);
		if (!document) return [];

		const fileName = shared.uriToFileName(document.uri);
		const offset = document.offsetAt(position);

		let info: ReturnType<typeof languageService.getDefinitionAndBoundSpan> | undefined;
		try { info = languageService.getDefinitionAndBoundSpan(fileName, offset); } catch { }
		if (!info) return [];

		return boundSpanToLocationLinks(info, document, getTextDocument, shared);
	};
}