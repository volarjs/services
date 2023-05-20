import type * as vscode from '@volar/language-service';
import { entriesToLocations } from '../utils/transforms';
import { SharedContext } from '../types';
import { safeCall } from '../shared';

export function register(ctx: SharedContext) {
	return (uri: string): vscode.Location[] => {
		const document = ctx.getTextDocument(uri);
		if (!document) return [];

		const fileName = ctx.env.uriToFileName(document.uri);
		const entries = safeCall(() => ctx.typescript.languageService.getFileReferences(fileName));
		if (!entries) return [];

		return entriesToLocations([...entries], ctx);
	};
}
