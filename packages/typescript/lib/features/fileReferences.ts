import type * as vscode from '@volar/language-service';
import { safeCall } from '../shared';
import type { SharedContext } from '../types';
import { entriesToLocations } from '../utils/transforms';

export function register(ctx: SharedContext) {
	return (uri: string): vscode.Location[] => {
		const document = ctx.getTextDocument(uri);
		if (!document) return [];

		const fileName = ctx.uriToFileName(document.uri);
		const entries = safeCall(() => ctx.languageService.getFileReferences(fileName));
		if (!entries) return [];

		return entriesToLocations([...entries], ctx);
	};
}
