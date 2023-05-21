import type { TextDocument } from 'vscode-languageserver-textdocument';
import type * as vscode from '@volar/language-service';
import type * as ts from 'typescript/lib/tsserverlibrary';
import * as PConst from '../protocol.const';
import { parseKindModifier } from '../utils/modifiers';
import * as typeConverters from '../utils/typeConverters';
import { posix as path } from 'path';
import { SharedContext } from '../types';
import { safeCall } from '../shared';

export function register(ctx: SharedContext) {
	function doPrepare(uri: string, position: vscode.Position) {

		const document = ctx.getTextDocument(uri);
		if (!document) return [];

		const fileName = ctx.env.uriToFileName(document.uri);
		const offset = document.offsetAt(position);
		const calls = safeCall(() => ctx.typescript.languageService.prepareCallHierarchy(fileName, offset));
		if (!calls) return [];

		const items = Array.isArray(calls) ? calls : [calls];

		return items.map(item => fromProtocolCallHierarchyItem(item));
	}
	function getIncomingCalls(item: vscode.CallHierarchyItem) {

		const document = ctx.getTextDocument(item.uri);
		if (!document) return [];

		const fileName = ctx.env.uriToFileName(item.uri);
		const offset = document.offsetAt(item.selectionRange.start);
		const calls = safeCall(() => ctx.typescript.languageService.provideCallHierarchyIncomingCalls(fileName, offset));
		if (!calls) return [];

		const items = Array.isArray(calls) ? calls : [calls];

		return items.map(item => fromProtocolCallHierarchyIncomingCall(item));
	}
	function getOutgoingCalls(item: vscode.CallHierarchyItem) {

		const document = ctx.getTextDocument(item.uri);
		if (!document) return [];

		const fileName = ctx.env.uriToFileName(item.uri);
		const offset = document.offsetAt(item.selectionRange.start);
		const calls = safeCall(() => ctx.typescript.languageService.provideCallHierarchyOutgoingCalls(fileName, offset));
		if (!calls) return [];

		const items = Array.isArray(calls) ? calls : [calls];

		return items.map(item => fromProtocolCallHierarchyOutgoingCall(item, document));
	}

	return {
		doPrepare,
		getIncomingCalls,
		getOutgoingCalls,
	};

	function isSourceFileItem(item: ts.CallHierarchyItem) {
		return item.kind === PConst.Kind.script || item.kind === PConst.Kind.module && item.selectionSpan.start === 0;
	}

	function fromProtocolCallHierarchyItem(item: ts.CallHierarchyItem): vscode.CallHierarchyItem {
		const rootPath = ctx.typescript.languageService.getProgram()?.getCompilerOptions().rootDir ?? '';
		const document = ctx.getTextDocument(ctx.env.fileNameToUri(item.file))!; // TODO
		const useFileName = isSourceFileItem(item);
		const name = useFileName ? path.basename(item.file) : item.name;
		const detail = useFileName ? path.relative(rootPath, path.dirname(item.file)) : item.containerName ?? '';
		const result: vscode.CallHierarchyItem = {
			kind: typeConverters.SymbolKind.fromProtocolScriptElementKind(item.kind),
			name,
			detail,
			uri: ctx.env.fileNameToUri(item.file),
			range: {
				start: document.positionAt(item.span.start),
				end: document.positionAt(item.span.start + item.span.length),
			},
			selectionRange: {
				start: document.positionAt(item.selectionSpan.start),
				end: document.positionAt(item.selectionSpan.start + item.selectionSpan.length),
			},
		};

		const kindModifiers = item.kindModifiers ? parseKindModifier(item.kindModifiers) : undefined;
		if (kindModifiers?.has(PConst.KindModifiers.deprecated)) {
			result.tags = [1 satisfies typeof vscode.SymbolTag.Deprecated];
		}
		return result;
	}

	function fromProtocolCallHierarchyIncomingCall(item: ts.CallHierarchyIncomingCall): vscode.CallHierarchyIncomingCall {
		const document = ctx.getTextDocument(ctx.env.fileNameToUri(item.from.file))!;
		return {
			from: fromProtocolCallHierarchyItem(item.from),
			fromRanges: item.fromSpans.map(fromSpan => ({
				start: document.positionAt(fromSpan.start),
				end: document.positionAt(fromSpan.start + fromSpan.length),
			})),
		};
	}

	function fromProtocolCallHierarchyOutgoingCall(item: ts.CallHierarchyOutgoingCall, document: TextDocument): vscode.CallHierarchyOutgoingCall {
		return {
			to: fromProtocolCallHierarchyItem(item.to),
			fromRanges: item.fromSpans.map(fromSpan => ({
				start: document.positionAt(fromSpan.start),
				end: document.positionAt(fromSpan.start + fromSpan.length),
			})),
		};
	}
};
