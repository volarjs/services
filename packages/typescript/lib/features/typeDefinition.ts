import type * as vscode from 'vscode-languageserver-protocol';
import { safeCall } from '../shared';
import type { SharedContext } from '../types';
import { entriesToLocationLinks } from '../utils/transforms';

export function register(ctx: SharedContext) {
	return (uri: string, position: vscode.Position) => {
		const document = ctx.getTextDocument(uri);
		if (!document) return [];

		const fileName = ctx.env.uriToFileName(document.uri);
		const offset = document.offsetAt(position);
		const entries = safeCall(() => ctx.typescript.languageService.getTypeDefinitionAtPosition(fileName, offset));
		if (!entries) return [];

		return entriesToLocationLinks([...entries], ctx);
	};
}
