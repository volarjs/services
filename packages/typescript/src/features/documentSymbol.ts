import type * as vscode from '@volar/language-service';
import type * as ts from 'typescript/lib/tsserverlibrary';
import * as PConst from '../protocol.const';
import { safeCall } from '../shared';
import type { SharedContext } from '../types';
import { parseKindModifier } from '../utils/modifiers';

const getSymbolKind = (kind: string): vscode.SymbolKind => {
	switch (kind) {
		case PConst.Kind.module: return 2 satisfies typeof vscode.SymbolKind.Module;
		case PConst.Kind.class: return 5 satisfies typeof vscode.SymbolKind.Class;
		case PConst.Kind.enum: return 10 satisfies typeof vscode.SymbolKind.Enum;
		case PConst.Kind.interface: return 11 satisfies typeof vscode.SymbolKind.Interface;
		case PConst.Kind.method: return 6 satisfies typeof vscode.SymbolKind.Method;
		case PConst.Kind.memberVariable: return 7 satisfies typeof vscode.SymbolKind.Property;
		case PConst.Kind.memberGetAccessor: return 7 satisfies typeof vscode.SymbolKind.Property;
		case PConst.Kind.memberSetAccessor: return 7 satisfies typeof vscode.SymbolKind.Property;
		case PConst.Kind.variable: return 13 satisfies typeof vscode.SymbolKind.Variable;
		case PConst.Kind.const: return 13 satisfies typeof vscode.SymbolKind.Variable;
		case PConst.Kind.localVariable: return 13 satisfies typeof vscode.SymbolKind.Variable;
		case PConst.Kind.function: return 12 satisfies typeof vscode.SymbolKind.Function;
		case PConst.Kind.localFunction: return 12 satisfies typeof vscode.SymbolKind.Function;
		case PConst.Kind.constructSignature: return 9 satisfies typeof vscode.SymbolKind.Constructor;
		case PConst.Kind.constructorImplementation: return 9 satisfies typeof vscode.SymbolKind.Constructor;
	}
	return 13 satisfies typeof vscode.SymbolKind.Variable;
};

export function register(ctx: SharedContext) {
	return (uri: string): vscode.DocumentSymbol[] => {

		const document = ctx.getTextDocument(uri);
		if (!document) return [];

		const fileName = ctx.env.uriToFileName(document.uri);
		const barItems = safeCall(() => ctx.typescript.languageService.getNavigationTree(fileName));
		if (!barItems) return [];

		// The root represents the file. Ignore this when showing in the UI
		const result = barItems.childItems
			?.map(
				function convertNavTree(item): vscode.DocumentSymbol[] {
					if (!shouldIncludeEntry(item)) {
						return [];
					}
					let remain = item.childItems ?? [];
					return item.spans.map(span => {
						const childItems: ts.NavigationTree[] = [];
						remain = remain.filter(child => {
							const childStart = child.spans[0].start;
							const childEnd = child.spans[child.spans.length - 1].start + child.spans[child.spans.length - 1].length;
							if (childStart >= span.start && childEnd <= span.start + span.length) {
								childItems.push(child);
								return false;
							}
							return true;
						});
						const nameSpan = item.spans.length === 1
							? (item.nameSpan ?? span)
							: span;
						const fullRange = {
							start: Math.min(span.start, nameSpan.start),
							end: Math.max(span.start + span.length, nameSpan.start + nameSpan.length),
						};
						const symbol: vscode.DocumentSymbol = {
							name: item.text,
							kind: getSymbolKind(item.kind),
							range: {
								start: document.positionAt(fullRange.start),
								end: document.positionAt(fullRange.end),
							},
							selectionRange: {
								start: document.positionAt(nameSpan.start),
								end: document.positionAt(nameSpan.start + nameSpan.length),
							},
							children: childItems.map(convertNavTree).flat(),
						};
						const kindModifiers = parseKindModifier(item.kindModifiers);
						if (kindModifiers.has(PConst.KindModifiers.deprecated)) {
							symbol.deprecated = true;
							symbol.tags ??= [];
							symbol.tags.push(1 satisfies typeof vscode.SymbolTag.Deprecated);
						}
						return symbol;
					});
				}
			)
			.flat();

		return result ?? [];

		function shouldIncludeEntry(item: ts.NavigationTree): boolean {
			if (item.kind === PConst.Kind.alias) {
				return false;
			}
			return !!(item.text && item.text !== '<function>' && item.text !== '<class>');
		}
	};
}
