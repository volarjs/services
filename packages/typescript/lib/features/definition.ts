import type * as vscode from '@volar/language-service';
import { safeCall } from '../shared';
import type { SharedContext } from '../types';
import { boundSpanToLocationLinks } from '../utils/transforms';

export function register(ctx: SharedContext) {
	return (uri: string, position: vscode.Position) => {

		const document = ctx.getTextDocument(uri);
		if (!document) return [];

		const fileName = ctx.uriToFileName(document.uri);
		const offset = document.offsetAt(position);
		const info = safeCall(() => ctx.languageService.getDefinitionAndBoundSpan(fileName, offset));
		if (!info) return [];

		return boundSpanToLocationLinks(info, document, ctx);
	};
}
