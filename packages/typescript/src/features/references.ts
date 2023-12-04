import type * as vscode from '@volar/language-service';
import { safeCall } from '../shared';
import type { SharedContext } from '../types';
import { entriesToLocations } from '../utils/transforms';

export function register(ctx: SharedContext) {
	return (uri: string, position: vscode.Position): vscode.Location[] => {
		const document = ctx.getTextDocument(uri);
		if (!document) return [];

		const fileName = ctx.env.uriToFileName(document.uri);
		const offset = document.offsetAt(position);
		const entries = safeCall(() => ctx.typescript.languageService.getReferencesAtPosition(fileName, offset));
		if (!entries) return [];

		return entriesToLocations([...entries], ctx);
	};
}
