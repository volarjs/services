import * as vscode from 'vscode-languageserver-protocol';
import * as previewer from '../utils/previewer';
import { SharedContext } from '../types';
import { safeCall } from '../shared';

export function register(ctx: SharedContext) {
	const ts = ctx.typescript!.module;

	return (uri: string, position: vscode.Position, documentOnly = false): vscode.Hover | undefined => {
		const document = ctx.getTextDocument(uri);
		if (!document) return;

		const fileName = ctx.uriToFileName(document.uri);
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
			kind: vscode.MarkupKind.Markdown,
			value: parts.join('\n\n'),
		};

		return {
			contents: markdown,
			range: vscode.Range.create(
				document.positionAt(info.textSpan.start),
				document.positionAt(info.textSpan.start + info.textSpan.length),
			),
		};

		function toResource(path: string) {
			return ctx.fileNameToUri(path);
		}
	};
}
