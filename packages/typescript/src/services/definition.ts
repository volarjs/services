import type * as vscode from '@volar/language-service';
import { boundSpanToLocationLinks } from '../utils/transforms';
import { SharedContext } from '../types';
import { safeCall } from '../shared';

export function register(ctx: SharedContext) {
	return (uri: string, position: vscode.Position) => {

		const document = ctx.getTextDocument(uri);
		if (!document) return [];

		const fileName = ctx.env.uriToFileName(document.uri);
		const offset = document.offsetAt(position);
		const info = safeCall(() => ctx.typescript.languageService.getDefinitionAndBoundSpan(fileName, offset));
		if (!info) return [];

		return boundSpanToLocationLinks(info, document, ctx);
	};
}
