import type * as vscode from '@volar/language-service';
import { getUserPreferences } from '../configs/getUserPreferences';
import { safeCall } from '../shared';
import type { SharedContext } from '../types';

export function register(ctx: SharedContext) {
	const { ts } = ctx;

	return async (uri: string, range: vscode.Range) => {

		const document = ctx.getTextDocument(uri);
		if (!document) return;

		const preferences = await getUserPreferences(ctx, document);
		const fileName = ctx.env.uriToFileName(document.uri);
		const start = document.offsetAt(range.start);
		const end = document.offsetAt(range.end);
		const inlayHints = safeCall(() =>
			'provideInlayHints' in ctx.typescript.languageService
				? ctx.typescript.languageService.provideInlayHints(fileName, { start, length: end - start }, preferences)
				: []
		) ?? [];

		return inlayHints.map(inlayHint => {
			const result: vscode.InlayHint = {
				position: document.positionAt(inlayHint.position),
				label: inlayHint.text,
				kind: inlayHint.kind === ts.InlayHintKind.Type ? 1 satisfies typeof vscode.InlayHintKind.Type
					: inlayHint.kind === ts.InlayHintKind.Parameter ? 2 satisfies typeof vscode.InlayHintKind.Parameter
						: undefined,
			};
			result.paddingLeft = inlayHint.whitespaceBefore;
			result.paddingRight = inlayHint.whitespaceAfter;
			return result;
		});
	};
}
