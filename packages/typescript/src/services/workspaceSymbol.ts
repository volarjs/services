import type * as ts from 'typescript/lib/tsserverlibrary';
import * as PConst from '../protocol.const';
import * as vscode from 'vscode-languageserver-protocol';
import { parseKindModifier } from '../utils/modifiers';
import { SharedContext } from '../types';
import { safeCall } from '../shared';

function getSymbolKind(item: ts.NavigateToItem): vscode.SymbolKind {
	switch (item.kind) {
		case PConst.Kind.method: return vscode.SymbolKind.Method;
		case PConst.Kind.enum: return vscode.SymbolKind.Enum;
		case PConst.Kind.enumMember: return vscode.SymbolKind.EnumMember;
		case PConst.Kind.function: return vscode.SymbolKind.Function;
		case PConst.Kind.class: return vscode.SymbolKind.Class;
		case PConst.Kind.interface: return vscode.SymbolKind.Interface;
		case PConst.Kind.type: return vscode.SymbolKind.Class;
		case PConst.Kind.memberVariable: return vscode.SymbolKind.Field;
		case PConst.Kind.memberGetAccessor: return vscode.SymbolKind.Field;
		case PConst.Kind.memberSetAccessor: return vscode.SymbolKind.Field;
		case PConst.Kind.variable: return vscode.SymbolKind.Variable;
		default: return vscode.SymbolKind.Variable;
	}
}

export function register(ctx: SharedContext) {
	return (query: string): vscode.WorkspaceSymbol[] => {

		const items = safeCall(() => ctx.typescript.languageService.getNavigateToItems(query));
		if (!items) return [];

		return items
			.filter(item => item.containerName || item.kind !== 'alias')
			.map(toWorkspaceSymbol)
			.filter((v): v is NonNullable<typeof v> => !!v);

		function toWorkspaceSymbol(item: ts.NavigateToItem) {
			const label = getLabel(item);
			const uri = ctx.fileNameToUri(item.fileName);
			const document = ctx.getTextDocument(uri);
			if (document) {
				const range = vscode.Range.create(document.positionAt(item.textSpan.start), document.positionAt(item.textSpan.start + item.textSpan.length));
				const info = vscode.WorkspaceSymbol.create(
					label,
					getSymbolKind(item),
					uri,
					range,
				);
				const kindModifiers = item.kindModifiers ? parseKindModifier(item.kindModifiers) : undefined;
				if (kindModifiers?.has(PConst.KindModifiers.deprecated)) {
					info.tags = [vscode.SymbolTag.Deprecated];
				}
				return info;
			}
		}

		function getLabel(item: ts.NavigateToItem) {
			const label = item.name;
			if (item.kind === 'method' || item.kind === 'function') {
				return label + '()';
			}
			return label;
		}
	};
}
