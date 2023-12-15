import type * as vscode from '@volar/language-service';
import { safeCall } from '../shared';
import type { SharedContext } from '../types';
import * as previewer from '../utils/previewer';

export function register(ctx: SharedContext) {
	const { ts } = ctx;

	return (uri: string, position: vscode.Position, documentOnly = false): vscode.Hover | undefined => {
		const document = ctx.getTextDocument(uri);
		if (!document) return;

		const fileName = ctx.env.uriToFileName(document.uri);
		const offset = document.offsetAt(position);
		const info = safeCall(() => ctx.typescript.languageService.getQuickInfoAtPosition(fileName, offset));
		if (!info) return;

		const parts: string[] = [];
		const displayString = ts.displayPartsToString(info.displayParts);
		const documentation = previewer.markdownDocumentation(info.documentation ?? [], info.tags, { toResource }, ctx);

		if (displayString && !documentOnly) {
			parts.push(['```typescript', displayString, '```'].join('\n'));
		}
		if (documentation) {
			parts.push(documentation);
		}

		const markdown: vscode.MarkupContent = {
			kind: 'markdown' satisfies typeof vscode.MarkupKind.Markdown,
			value: parts.join('\n\n'),
		};

		return {
			contents: markdown,
			range: {
				start: document.positionAt(info.textSpan.start),
				end: document.positionAt(info.textSpan.start + info.textSpan.length),
			},
		};

		function toResource(path: string) {
			return ctx.env.fileNameToUri(path);
		}
	};
}
