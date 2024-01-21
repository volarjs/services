import type * as vscode from '@volar/language-service';
import type * as ts from 'typescript';
import * as PConst from '../protocol.const';
import { safeCall } from '../shared';
import type { SharedContext } from '../types';
import { parseKindModifier } from '../utils/modifiers';

function getSymbolKind(item: ts.NavigateToItem): vscode.SymbolKind {
	switch (item.kind) {
		case PConst.Kind.method: return 6 satisfies typeof vscode.SymbolKind.Method;
		case PConst.Kind.enum: return 10 satisfies typeof vscode.SymbolKind.Enum;
		case PConst.Kind.enumMember: return 22 satisfies typeof vscode.SymbolKind.EnumMember;
		case PConst.Kind.function: return 12 satisfies typeof vscode.SymbolKind.Function;
		case PConst.Kind.class: return 5 satisfies typeof vscode.SymbolKind.Class;
		case PConst.Kind.interface: return 11 satisfies typeof vscode.SymbolKind.Interface;
		case PConst.Kind.type: return 5 satisfies typeof vscode.SymbolKind.Class;
		case PConst.Kind.memberVariable: return 8 satisfies typeof vscode.SymbolKind.Field;
		case PConst.Kind.memberGetAccessor: return 8 satisfies typeof vscode.SymbolKind.Field;
		case PConst.Kind.memberSetAccessor: return 8 satisfies typeof vscode.SymbolKind.Field;
		case PConst.Kind.variable: return 13 satisfies typeof vscode.SymbolKind.Variable;
		default: return 13 satisfies typeof vscode.SymbolKind.Variable;
	}
}

export function register(ctx: SharedContext) {
	return (query: string): vscode.WorkspaceSymbol[] => {

		const items = safeCall(() => ctx.languageService.getNavigateToItems(query));
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
				const range: vscode.Range = {
					start: document.positionAt(item.textSpan.start),
					end: document.positionAt(item.textSpan.start + item.textSpan.length),
				};
				const info: vscode.WorkspaceSymbol = {
					name: label,
					kind: getSymbolKind(item),
					location: { uri, range },
				};
				const kindModifiers = item.kindModifiers ? parseKindModifier(item.kindModifiers) : undefined;
				if (kindModifiers?.has(PConst.KindModifiers.deprecated)) {
					info.tags = [1 satisfies typeof vscode.SymbolTag.Deprecated];
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
