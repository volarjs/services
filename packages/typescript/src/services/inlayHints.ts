import { SharedContext } from '../types';
import * as vscode from 'vscode-languageserver-protocol';
import { getUserPreferences } from '../configs/getUserPreferences';
import { safeCall } from '../shared';

export function register(ctx: SharedContext) {
	const ts = ctx.typescript!.module;

	return async (uri: string, range: vscode.Range) => {

		const document = ctx.getTextDocument(uri);
		if (!document) return;

		const preferences = await getUserPreferences(ctx, document);
		const fileName = ctx.uriToFileName(document.uri);
		const start = document.offsetAt(range.start);
		const end = document.offsetAt(range.end);
		const inlayHints = safeCall(() =>
			'provideInlayHints' in ctx.typescript.languageService
				? ctx.typescript.languageService.provideInlayHints(fileName, { start, length: end - start }, preferences)
				: []
		) ?? [];

		return inlayHints.map(inlayHint => {
			const result = vscode.InlayHint.create(
				document.positionAt(inlayHint.position),
				inlayHint.text,
				inlayHint.kind === ts.InlayHintKind.Type ? vscode.InlayHintKind.Type
					: inlayHint.kind === ts.InlayHintKind.Parameter ? vscode.InlayHintKind.Parameter
						: undefined,
			);
			result.paddingLeft = inlayHint.whitespaceBefore;
			result.paddingRight = inlayHint.whitespaceAfter;
			return result;
		});
	};
}
