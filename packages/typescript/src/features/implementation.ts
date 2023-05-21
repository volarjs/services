import type * as vscode from 'vscode-languageserver-protocol';
import { entriesToLocationLinks } from '../utils/transforms';
import { SharedContext } from '../types';
import { safeCall } from '../shared';

export function register(ctx: SharedContext) {
	return (uri: string, position: vscode.Position) => {
		const document = ctx.getTextDocument(uri);
		if (!document) return [];

		const fileName = ctx.env.uriToFileName(document.uri);
		const offset = document.offsetAt(position);
		const entries = safeCall(() => ctx.typescript.languageService.getImplementationAtPosition(fileName, offset));
		if (!entries) return [];

		return entriesToLocationLinks([...entries], ctx);
	};
}
