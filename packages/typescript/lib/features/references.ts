import type * as vscode from '@volar/language-service';
import { safeCall } from '../shared';
import type { SharedContext } from '../types';
import { entryToLocation } from '../utils/transforms';

export function register(ctx: SharedContext) {
	return (uri: string, position: vscode.Position, referenceContext: vscode.ReferenceContext): vscode.Location[] => {
		const document = ctx.getTextDocument(uri);
		if (!document) return [];

		const fileName = ctx.uriToFileName(document.uri);
		const offset = document.offsetAt(position);
		const references = safeCall(() => ctx.languageService.findReferences(fileName, offset));
		if (!references) return [];

		const result: vscode.Location[] = [];
		for (const reference of references) {
			if (referenceContext.includeDeclaration) {
				const definition = entryToLocation(reference.definition, ctx);
				if (definition) {
					result.push(definition);
				}
			}
			for (const referenceEntry of reference.references) {
				const reference = entryToLocation(referenceEntry, ctx);
				if (reference) {
					result.push(reference);
				}
			}
		}
		return result;
	};
}
