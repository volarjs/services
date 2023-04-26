import type * as ts from 'typescript/lib/tsserverlibrary';
import * as PConst from '../protocol.const';
import * as vscode from 'vscode-languageserver-protocol';
import { parseKindModifier } from '../utils/modifiers';
import { SharedContext } from '../types';
import { safeCall } from '../shared';

const getSymbolKind = (kind: string): vscode.SymbolKind => {
	switch (kind) {
		case PConst.Kind.module: return vscode.SymbolKind.Module;
		case PConst.Kind.class: return vscode.SymbolKind.Class;
		case PConst.Kind.enum: return vscode.SymbolKind.Enum;
		case PConst.Kind.interface: return vscode.SymbolKind.Interface;
		case PConst.Kind.method: return vscode.SymbolKind.Method;
		case PConst.Kind.memberVariable: return vscode.SymbolKind.Property;
		case PConst.Kind.memberGetAccessor: return vscode.SymbolKind.Property;
		case PConst.Kind.memberSetAccessor: return vscode.SymbolKind.Property;
		case PConst.Kind.variable: return vscode.SymbolKind.Variable;
		case PConst.Kind.const: return vscode.SymbolKind.Variable;
		case PConst.Kind.localVariable: return vscode.SymbolKind.Variable;
		case PConst.Kind.function: return vscode.SymbolKind.Function;
		case PConst.Kind.localFunction: return vscode.SymbolKind.Function;
		case PConst.Kind.constructSignature: return vscode.SymbolKind.Constructor;
		case PConst.Kind.constructorImplementation: return vscode.SymbolKind.Constructor;
	}
	return vscode.SymbolKind.Variable;
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
						const symbol = vscode.DocumentSymbol.create(
							item.text,
							undefined,
							getSymbolKind(item.kind),
							vscode.Range.create(
								document.positionAt(fullRange.start),
								document.positionAt(fullRange.end),
							),
							vscode.Range.create(
								document.positionAt(nameSpan.start),
								document.positionAt(nameSpan.start + nameSpan.length),
							),
							childItems.map(convertNavTree).flat(),
						);
						const kindModifiers = parseKindModifier(item.kindModifiers);
						if (kindModifiers.has(PConst.KindModifiers.deprecated)) {
							symbol.deprecated = true;
							symbol.tags ??= [];
							symbol.tags.push(vscode.SymbolTag.Deprecated);
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
