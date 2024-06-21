import type * as vscode from '@volar/language-service';
import * as path from 'path-browserify';
import * as semver from 'semver';
import type * as ts from 'typescript';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { URI } from 'vscode-uri';
import * as PConst from '../protocol.const';
import type { SharedContext } from '../semanticFeatures/types';
import { parseKindModifier } from '../utils/modifiers';
import * as previewer from '../utils/previewer';
import * as typeConverters from '../utils/typeConverters';

// diagnostics

export function convertDiagnostic(
	diag: ts.Diagnostic,
	document: TextDocument,
	fileNameToUri: (fileName: string) => URI,
	getTextDocument: (uri: URI) => TextDocument | undefined
): vscode.Diagnostic | undefined {

	if (diag.start === undefined) {
		return;
	}
	if (diag.length === undefined) {
		return;
	}

	const diagnostic: vscode.Diagnostic = {
		range: {
			start: document.positionAt(diag.start),
			end: document.positionAt(diag.start + diag.length),
		},
		severity: convertDiagnosticCategory(diag.category),
		source: 'ts',
		code: diag.code,
		message: getMessageText(diag),
	};

	if (diag.relatedInformation) {
		diagnostic.relatedInformation = diag.relatedInformation
			.map(rErr => convertDiagnosticRelatedInformation(rErr, fileNameToUri, getTextDocument))
			.filter((v): v is NonNullable<typeof v> => !!v);
	}
	if (diag.reportsUnnecessary) {
		if (diagnostic.tags === undefined) {
			diagnostic.tags = [];
		}
		diagnostic.tags.push(1 satisfies typeof vscode.DiagnosticTag.Unnecessary);
	}
	if (diag.reportsDeprecated) {
		if (diagnostic.tags === undefined) {
			diagnostic.tags = [];
		}
		diagnostic.tags.push(2 satisfies typeof vscode.DiagnosticTag.Deprecated);
	}

	return diagnostic;
}

function convertDiagnosticRelatedInformation(
	diag: ts.Diagnostic,
	fileNameToUri: (fileName: string) => URI,
	getTextDocument: (uri: URI) => TextDocument | undefined
): vscode.DiagnosticRelatedInformation | undefined {

	if (diag.start === undefined) {
		return;
	}
	if (diag.length === undefined) {
		return;
	}

	let document: TextDocument | undefined;
	if (diag.file) {
		document = getTextDocument(fileNameToUri(diag.file.fileName));
	}
	if (!document) {
		return;
	}

	const diagnostic: vscode.DiagnosticRelatedInformation = {
		location: {
			uri: document.uri,
			range: {
				start: document.positionAt(diag.start),
				end: document.positionAt(diag.start + diag.length),
			},
		},
		message: getMessageText(diag),
	};

	return diagnostic;
}

function convertDiagnosticCategory(input: ts.DiagnosticCategory): vscode.DiagnosticSeverity {
	switch (input) {
		case 0 satisfies ts.DiagnosticCategory.Warning: return 2 satisfies typeof vscode.DiagnosticSeverity.Warning;
		case 1 satisfies ts.DiagnosticCategory.Error: return 1 satisfies typeof vscode.DiagnosticSeverity.Error;
		case 2 satisfies ts.DiagnosticCategory.Suggestion: return 4 satisfies typeof vscode.DiagnosticSeverity.Hint;
		case 3 satisfies ts.DiagnosticCategory.Message: return 3 satisfies typeof vscode.DiagnosticSeverity.Information;
	}
	return 1 satisfies typeof vscode.DiagnosticSeverity.Error;
}

function getMessageText(diag: ts.Diagnostic | ts.DiagnosticMessageChain, level = 0) {
	let messageText = '  '.repeat(level);

	if (typeof diag.messageText === 'string') {
		messageText += diag.messageText;
	}
	else {
		messageText += diag.messageText.messageText;
		if (diag.messageText.next) {
			for (const info of diag.messageText.next) {
				messageText += '\n' + getMessageText(info, level + 1);
			}
		}
	}

	return messageText;
}

// completion resolve

export function applyCompletionEntryDetails(
	ts: typeof import('typescript'),
	item: vscode.CompletionItem,
	data: ts.CompletionEntryDetails,
	document: TextDocument,
	fileNameToUri: (fileName: string) => URI,
	getTextDocument: (uri: URI) => TextDocument | undefined
) {
	const { sourceDisplay } = data;
	if (sourceDisplay) {
		item.labelDetails ??= {};
		item.labelDetails.description = ts.displayPartsToString(sourceDisplay);
	}
	const detailTexts: string[] = [];
	if (data.codeActions) {
		item.additionalTextEdits ??= [];
		for (const action of data.codeActions) {
			detailTexts.push(action.description);
			for (const changes of action.changes) {
				const ranges = changes.textChanges.map(change => convertTextSpan(change.span, document));
				ranges.forEach((range, index) => {
					item.additionalTextEdits?.push({ range, newText: changes.textChanges[index].newText });
				});
			}
		}
	}
	if (data.displayParts) {
		detailTexts.push(previewer.plainWithLinks(data.displayParts, fileNameToUri, getTextDocument));
	}
	if (detailTexts.length) {
		item.detail = detailTexts.join('\n');
	}
	item.documentation = {
		kind: 'markdown',
		value: previewer.markdownDocumentation(data.documentation, data.tags, fileNameToUri, getTextDocument),
	};
	if (data) {
		handleKindModifiers(item, data);
	}
}

// completion

export function convertCompletionInfo<T>(
	ts: typeof import('typescript'),
	completionContext: ts.CompletionInfo,
	document: TextDocument,
	position: vscode.Position,
	createData: (tsEntry: ts.CompletionEntry) => T
): vscode.CompletionList {
	const lt_320 = semver.lt(ts.version, '3.2.0');
	const gte_300 = semver.gte(ts.version, '3.0.0');
	const wordRange: vscode.Range | undefined = completionContext.optionalReplacementSpan
		? convertTextSpan(completionContext.optionalReplacementSpan, document)
		: undefined;
	const line = getLineText(document, position.line);
	const dotAccessorContext = getDotAccessorContext(document);
	const entries = completionContext.entries
		.map(tsEntry => ({
			...convertCompletionEntry(tsEntry, document),
			data: createData(tsEntry),
		}));
	return {
		isIncomplete: !!completionContext.isIncomplete,
		items: entries,
	};

	function convertCompletionEntry(tsEntry: ts.CompletionEntry, document: TextDocument) {

		const item: vscode.CompletionItem = { label: tsEntry.name };

		item.kind = convertCompletionItemKind(tsEntry.kind);

		if (tsEntry.source && tsEntry.hasAction) {
			// De-prioritize auto-imports
			// https://github.com/microsoft/vscode/issues/40311
			item.sortText = '\uffff' + tsEntry.sortText;

		} else {
			item.sortText = tsEntry.sortText;
		}

		const { sourceDisplay, isSnippet, labelDetails } = tsEntry;
		if (sourceDisplay) {
			item.labelDetails ??= {};
			item.labelDetails.description = ts.displayPartsToString(sourceDisplay);
		}

		if (labelDetails) {
			item.labelDetails ??= {};
			Object.assign(item.labelDetails, labelDetails);
		}

		item.preselect = tsEntry.isRecommended;

		let range: vscode.Range | ReturnType<typeof getRangeFromReplacementSpan> = getRangeFromReplacementSpan(tsEntry, document);
		item.commitCharacters = getCommitCharacters(tsEntry, {
			isNewIdentifierLocation: completionContext.isNewIdentifierLocation,
			isInValidCommitCharacterContext: isInValidCommitCharacterContext(document, position),
			enableCallCompletions: true, // TODO: suggest.completeFunctionCalls
		});
		item.insertText = tsEntry.insertText;
		item.insertTextFormat = isSnippet ? 2 satisfies typeof vscode.InsertTextFormat.Snippet : 1 satisfies typeof vscode.InsertTextFormat.PlainText;
		item.filterText = getFilterText(tsEntry, wordRange, line, tsEntry.insertText);

		if (completionContext?.isMemberCompletion && dotAccessorContext && !isSnippet) {
			item.filterText = dotAccessorContext.text + (item.insertText || item.label);
			if (!range) {
				const replacementRange = wordRange;
				if (replacementRange) {
					range = {
						inserting: dotAccessorContext.range,
						replacing: rangeUnion(dotAccessorContext.range, replacementRange),
					};
				} else {
					range = dotAccessorContext.range;
				}
				item.insertText = item.filterText;
			}
		}

		handleKindModifiers(item, tsEntry);

		if (!range && wordRange) {
			range = {
				inserting: { start: wordRange.start, end: position },
				replacing: wordRange,
			};
		}

		if (range) {
			if ('start' in range) {
				item.textEdit = {
					range,
					newText: item.insertText || item.label,
				};
			}
			else {
				item.textEdit = {
					insert: range.inserting,
					replace: range.replacing,
					newText: item.insertText || item.label,
				};
			}
		}

		return item;
	}

	function getDotAccessorContext(document: TextDocument) {
		let dotAccessorContext: {
			range: vscode.Range;
			text: string;
		} | undefined;

		if (gte_300) {

			if (!completionContext) {
				return;
			}

			const isMemberCompletion = completionContext.isMemberCompletion;
			if (isMemberCompletion) {
				const dotMatch = line.slice(0, position.character).match(/\??\.\s*$/) || undefined;
				if (dotMatch) {
					const range = {
						start: { line: position.line, character: position.character - dotMatch[0].length },
						end: position,
					};
					const text = document.getText(range);
					dotAccessorContext = { range, text };
				}
			}
		}

		return dotAccessorContext;
	}

	// from vscode typescript
	function getRangeFromReplacementSpan(tsEntry: ts.CompletionEntry, document: TextDocument) {
		if (!tsEntry.replacementSpan) {
			return;
		}

		let replaceRange: vscode.Range = {
			start: document.positionAt(tsEntry.replacementSpan.start),
			end: document.positionAt(tsEntry.replacementSpan.start + tsEntry.replacementSpan.length),
		};
		// Make sure we only replace a single line at most
		if (replaceRange.start.line !== replaceRange.end.line) {
			replaceRange = {
				start: {
					line: replaceRange.start.line,
					character: replaceRange.start.character,
				},
				end: {
					line: replaceRange.start.line,
					character: document.positionAt(document.offsetAt({ line: replaceRange.start.line + 1, character: 0 }) - 1).character,
				},
			};
		}

		// If TS returns an explicit replacement range, we should use it for both types of completion
		return {
			inserting: replaceRange,
			replacing: replaceRange,
		};
	}

	function getFilterText(tsEntry: ts.CompletionEntry, wordRange: vscode.Range | undefined, line: string, insertText: string | undefined): string | undefined {
		// Handle private field completions
		if (tsEntry.name.startsWith('#')) {
			const wordStart = wordRange ? line.charAt(wordRange.start.character) : undefined;
			if (insertText) {
				if (insertText.startsWith('this.#')) {
					return wordStart === '#' ? insertText : insertText.replace(/^this\.#/, '');
				} else {
					return insertText;
				}
			} else {
				return wordStart === '#' ? undefined : tsEntry.name.replace(/^#/, '');
			}
		}

		// For `this.` completions, generally don't set the filter text since we don't want them to be overly prioritized. #74164
		if (insertText?.startsWith('this.')) {
			return undefined;
		}

		// Handle the case:
		// ```
		// const xyz = { 'ab c': 1 };
		// xyz.ab|
		// ```
		// In which case we want to insert a bracket accessor but should use `.abc` as the filter text instead of
		// the bracketed insert text.
		else if (insertText?.startsWith('[')) {
			return insertText.replace(/^\[['"](.+)[['"]\]$/, '.$1');
		}

		// In all other cases, fallback to using the insertText
		return insertText;
	}

	function getCommitCharacters(entry: ts.CompletionEntry, context: {
		isNewIdentifierLocation: boolean,
		isInValidCommitCharacterContext: boolean,
		enableCallCompletions: boolean,
	}): string[] | undefined {
		if (entry.kind === PConst.Kind.warning) { // Ambient JS word based suggestion
			return undefined;
		}

		if (context.isNewIdentifierLocation || !context.isInValidCommitCharacterContext) {
			return undefined;
		}

		const commitCharacters: string[] = ['.', ',', ';'];
		if (context.enableCallCompletions) {
			commitCharacters.push('(');
		}

		return commitCharacters;
	}

	function isInValidCommitCharacterContext(
		document: TextDocument,
		position: vscode.Position
	): boolean {
		if (lt_320) {
			// Workaround for https://github.com/microsoft/TypeScript/issues/27742
			// Only enable dot completions when the previous character is not a dot preceded by whitespace.
			// Prevents incorrectly completing while typing spread operators.
			if (position.character > 1) {
				const preText = document.getText({
					start: { line: position.line, character: 0 },
					end: position,
				});
				return preText.match(/(\s|^)\.$/ig) === null;
			}
		}

		return true;
	}
}

function convertCompletionItemKind(kind: string): vscode.CompletionItemKind {
	switch (kind) {
		case PConst.Kind.primitiveType:
		case PConst.Kind.keyword:
			return 14 satisfies typeof vscode.CompletionItemKind.Keyword;

		case PConst.Kind.const:
		case PConst.Kind.let:
		case PConst.Kind.variable:
		case PConst.Kind.localVariable:
		case PConst.Kind.alias:
		case PConst.Kind.parameter:
			return 6 satisfies typeof vscode.CompletionItemKind.Variable;

		case PConst.Kind.memberVariable:
		case PConst.Kind.memberGetAccessor:
		case PConst.Kind.memberSetAccessor:
			return 5 satisfies typeof vscode.CompletionItemKind.Field;

		case PConst.Kind.function:
		case PConst.Kind.localFunction:
			return 3 satisfies typeof vscode.CompletionItemKind.Function;

		case PConst.Kind.method:
		case PConst.Kind.constructSignature:
		case PConst.Kind.callSignature:
		case PConst.Kind.indexSignature:
			return 2 satisfies typeof vscode.CompletionItemKind.Method;

		case PConst.Kind.enum:
			return 13 satisfies typeof vscode.CompletionItemKind.Enum;

		case PConst.Kind.enumMember:
			return 20 satisfies typeof vscode.CompletionItemKind.EnumMember;

		case PConst.Kind.module:
		case PConst.Kind.externalModuleName:
			return 9 satisfies typeof vscode.CompletionItemKind.Module;

		case PConst.Kind.class:
		case PConst.Kind.type:
			return 7 satisfies typeof vscode.CompletionItemKind.Class;

		case PConst.Kind.interface:
			return 8 satisfies typeof vscode.CompletionItemKind.Interface;

		case PConst.Kind.warning:
			return 1 satisfies typeof vscode.CompletionItemKind.Text;

		case PConst.Kind.script:
			return 17 satisfies typeof vscode.CompletionItemKind.File;

		case PConst.Kind.directory:
			return 19 satisfies typeof vscode.CompletionItemKind.Folder;

		case PConst.Kind.string:
			return 21 satisfies typeof vscode.CompletionItemKind.Constant;

		default:
			return 10 satisfies typeof vscode.CompletionItemKind.Property;
	}
}

function handleKindModifiers(item: vscode.CompletionItem, tsEntry: ts.CompletionEntry | ts.CompletionEntryDetails) {
	if (tsEntry.kindModifiers) {
		const kindModifiers = parseKindModifier(tsEntry.kindModifiers);
		if (kindModifiers.has(PConst.KindModifiers.optional)) {
			if (!item.insertText) {
				item.insertText = item.label;
			}

			if (!item.filterText) {
				item.filterText = item.label;
			}
			item.label += '?';
		}
		if (kindModifiers.has(PConst.KindModifiers.deprecated)) {
			item.tags = [1 satisfies typeof vscode.CompletionItemTag.Deprecated];
		}

		if (kindModifiers.has(PConst.KindModifiers.color)) {
			item.kind = 16 satisfies typeof vscode.CompletionItemKind.Color;
		}

		if (tsEntry.kind === PConst.Kind.script) {
			for (const extModifier of PConst.KindModifiers.fileExtensionKindModifiers) {
				if (kindModifiers.has(extModifier)) {
					if (tsEntry.name.toLowerCase().endsWith(extModifier)) {
						item.detail = tsEntry.name;
					} else {
						item.detail = tsEntry.name + extModifier;
					}
					break;
				}
			}
		}
	}
}

function rangeUnion(a: vscode.Range, b: vscode.Range): vscode.Range {
	const start = (a.start.line < b.start.line || (a.start.line === b.start.line && a.start.character < b.start.character)) ? a.start : b.start;
	const end = (a.end.line > b.end.line || (a.end.line === b.end.line && a.end.character > b.end.character)) ? a.end : b.end;
	return { start, end };
}

export function getLineText(document: TextDocument, line: number) {
	const endOffset = document.offsetAt({ line: line + 1, character: 0 });
	const end = document.positionAt(endOffset);
	const text = document.getText({
		start: { line: line, character: 0 },
		end: end.line === line ? end : document.positionAt(endOffset - 1),
	});
	return text;
}

// workspaceSymbol

export function convertNavigateToItem(
	item: ts.NavigateToItem,
	document: TextDocument
) {
	const info: vscode.WorkspaceSymbol = {
		name: getLabel(item),
		kind: convertScriptElementKind(item.kind),
		location: {
			uri: document.uri,
			range: convertTextSpan(item.textSpan, document),
		},
	};
	const kindModifiers = item.kindModifiers ? parseKindModifier(item.kindModifiers) : undefined;
	if (kindModifiers?.has(PConst.KindModifiers.deprecated)) {
		info.tags = [1 satisfies typeof vscode.SymbolTag.Deprecated];
	}
	return info;
}

function getLabel(item: ts.NavigateToItem) {
	const label = item.name;
	if (item.kind === 'method' || item.kind === 'function') {
		return label + '()';
	}
	return label;
}

function convertScriptElementKind(kind: ts.ScriptElementKind): vscode.SymbolKind {
	switch (kind) {
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

// inlayHints

export function convertInlayHint(hint: ts.InlayHint, document: TextDocument): vscode.InlayHint {
	const result: vscode.InlayHint = {
		position: document.positionAt(hint.position),
		label: hint.text,
		kind: hint.kind === 'Type' ? 1 satisfies typeof vscode.InlayHintKind.Type
			: hint.kind === 'Parameter' ? 2 satisfies typeof vscode.InlayHintKind.Parameter
				: undefined,
	};
	result.paddingLeft = hint.whitespaceBefore;
	result.paddingRight = hint.whitespaceAfter;
	return result;
}

// documentHighlight

export function convertHighlightSpan(span: ts.HighlightSpan, document: TextDocument): vscode.DocumentHighlight {
	return {
		kind: span.kind === 'writtenReference'
			? 3 satisfies typeof vscode.DocumentHighlightKind.Write
			: 2 satisfies typeof vscode.DocumentHighlightKind.Read,
		range: convertTextSpan(span.textSpan, document),
	};
}

// selectionRanges

export function convertSelectionRange(range: ts.SelectionRange, document: TextDocument): vscode.SelectionRange {
	return {
		parent: range.parent
			? convertSelectionRange(range.parent, document)
			: undefined,
		range: convertTextSpan(range.textSpan, document),
	};
}


// rename

export function convertFileTextChanges(
	changes: readonly ts.FileTextChanges[],
	fileNameToUri: (fileName: string) => URI,
	getTextDocument: (uri: URI) => TextDocument | undefined
) {
	const workspaceEdit: vscode.WorkspaceEdit = {};
	for (const change of changes) {
		if (!workspaceEdit.documentChanges) {
			workspaceEdit.documentChanges = [];
		}
		const uri = fileNameToUri(change.fileName);
		if (change.isNewFile) {
			workspaceEdit.documentChanges.push({ kind: 'create', uri: uri.toString() });
			workspaceEdit.documentChanges.push({
				textDocument: {
					uri: uri.toString(),
					version: null, // fix https://github.com/johnsoncodehk/volar/issues/2025
				},
				edits: change.textChanges.map(edit => ({
					newText: edit.newText,
					range: {
						start: { line: 0, character: edit.span.start },
						end: { line: 0, character: edit.span.start + edit.span.length },
					},
				})),
			});
		}
		else {
			const doc = getTextDocument(uri);
			workspaceEdit.documentChanges.push({
				textDocument: {
					uri: uri.toString(),
					version: null, // fix https://github.com/johnsoncodehk/volar/issues/2025
				},
				edits: change.textChanges.map(edit => convertTextChange(edit, doc)),
			});
		}
	}
	return workspaceEdit;
}

// rename file

export function convertRenameLocations(
	newText: string,
	locations: readonly ts.RenameLocation[],
	fileNameToUri: (fileName: string) => URI,
	getTextDocument: (uri: URI) => TextDocument | undefined
) {
	const workspaceEdit: vscode.WorkspaceEdit = {};
	for (const location of locations) {
		if (!workspaceEdit.changes) {
			workspaceEdit.changes = {};
		}
		const uri = fileNameToUri(location.fileName);
		const doc = getTextDocument(uri);
		if (!workspaceEdit.changes[uri.toString()]) {
			workspaceEdit.changes[uri.toString()] = [];
		}
		let _newText = newText;
		if (location.prefixText) {
			_newText = location.prefixText + _newText;
		}
		if (location.suffixText) {
			_newText = _newText + location.suffixText;
		}
		workspaceEdit.changes[uri.toString()].push({
			newText: _newText,
			range: convertTextSpan(location.textSpan, doc),
		});
	}
	return workspaceEdit;
}

// hover

export function convertQuickInfo(
	ts: typeof import('typescript'),
	info: ts.QuickInfo,
	document: TextDocument,
	fileNameToUri: (fileName: string) => URI,
	getTextDocument: (uri: URI) => TextDocument | undefined
): vscode.Hover {
	const parts: string[] = [];
	const displayString = ts.displayPartsToString(info.displayParts);
	const documentation = previewer.markdownDocumentation(
		info.documentation ?? [],
		info.tags,
		fileNameToUri,
		getTextDocument
	);
	if (displayString) {
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
		range: convertTextSpan(info.textSpan, document),
	};
}

// documentSymbol

export function convertNavTree(item: ts.NavigationTree, document: TextDocument): vscode.DocumentSymbol[] {
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
			range: convertTextSpan({
				start: fullRange.start,
				length: fullRange.end - fullRange.start,
			}, document),
			selectionRange: convertTextSpan(nameSpan, document),
			children: childItems.map(item => convertNavTree(item, document)).flat(),
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

function shouldIncludeEntry(item: ts.NavigationTree): boolean {
	if (item.kind === PConst.Kind.alias) {
		return false;
	}
	return !!(item.text && item.text !== '<function>' && item.text !== '<class>');
}

// foldingRanges

export function convertOutliningSpan(outliningSpan: ts.OutliningSpan, document: TextDocument): vscode.FoldingRange {
	const start = document.positionAt(outliningSpan.textSpan.start);
	const end = adjustFoldingEnd(start, document.positionAt(outliningSpan.textSpan.start + outliningSpan.textSpan.length), document);
	return {
		startLine: start.line,
		endLine: end.line,
		startCharacter: start.character,
		endCharacter: end.character,
		kind: convertOutliningSpanKind(outliningSpan.kind),
	};
}

export function convertOutliningSpanKind(kind: ts.OutliningSpanKind): vscode.FoldingRangeKind | undefined {
	switch (kind) {
		case 'comment': return 'comment' satisfies typeof vscode.FoldingRangeKind.Comment;
		case 'region': return 'region' satisfies typeof vscode.FoldingRangeKind.Region;
		case 'imports': return 'imports' satisfies typeof vscode.FoldingRangeKind.Imports;
		case 'code':
		default: return undefined;
	}
}

const foldEndPairCharacters = ['}', ']', ')', '`'];

// https://github.com/microsoft/vscode/blob/bed61166fb604e519e82e4d1d1ed839bc45d65f8/extensions/typescript-language-features/src/languageFeatures/folding.ts#L61-L73
function adjustFoldingEnd(start: vscode.Position, end: vscode.Position, document: TextDocument) {
	// workaround for #47240
	if (end.character > 0) {
		const foldEndCharacter = document.getText({
			start: { line: end.line, character: end.character - 1 },
			end,
		});
		if (foldEndPairCharacters.includes(foldEndCharacter)) {
			const endOffset = Math.max(document.offsetAt({ line: end.line, character: 0 }) - 1, document.offsetAt(start));
			return document.positionAt(endOffset);
		}
	}

	return end;
}

// formatting

export function convertTextChange(edit: ts.TextChange, document: TextDocument | undefined): vscode.TextEdit {
	return {
		range: convertTextSpan(edit.span, document),
		newText: edit.newText,
	};
}

// callHierarchy

export function convertCallHierarchyIncomingCall(item: ts.CallHierarchyIncomingCall, ctx: SharedContext): vscode.CallHierarchyIncomingCall {
	const uri = ctx.fileNameToUri(item.from.file);
	const document = ctx.getTextDocument(uri);
	return {
		from: convertCallHierarchyItem(item.from, ctx),
		fromRanges: item.fromSpans
			.map(span => convertTextSpan(span, document))
			.filter(span => !!span),
	};
}

export function convertCallHierarchyOutgoingCall(item: ts.CallHierarchyOutgoingCall, fromDocument: TextDocument, ctx: SharedContext): vscode.CallHierarchyOutgoingCall {
	return {
		to: convertCallHierarchyItem(item.to, ctx),
		fromRanges: item.fromSpans
			.map(span => convertTextSpan(span, fromDocument))
			.filter(span => !!span),
	};
}

export function convertCallHierarchyItem(item: ts.CallHierarchyItem, ctx: SharedContext): vscode.CallHierarchyItem {
	const rootPath = ctx.languageService.getProgram()?.getCompilerOptions().rootDir ?? '';
	const uri = ctx.fileNameToUri(item.file);
	const document = ctx.getTextDocument(uri);
	const useFileName = isSourceFileItem(item);
	const name = useFileName ? path.basename(item.file) : item.name;
	const detail = useFileName ? path.relative(rootPath, path.dirname(item.file)) : item.containerName ?? '';
	const result: vscode.CallHierarchyItem = {
		kind: typeConverters.SymbolKind.fromProtocolScriptElementKind(item.kind),
		name,
		detail,
		uri: uri.toString(),
		range: convertTextSpan(item.span, document),
		selectionRange: convertTextSpan(item.selectionSpan, document),
	};

	const kindModifiers = item.kindModifiers ? parseKindModifier(item.kindModifiers) : undefined;
	if (kindModifiers?.has(PConst.KindModifiers.deprecated)) {
		result.tags = [1 satisfies typeof vscode.SymbolTag.Deprecated];
	}
	return result;
}

function isSourceFileItem(item: ts.CallHierarchyItem) {
	return item.kind === PConst.Kind.script || item.kind === PConst.Kind.module && item.selectionSpan.start === 0;
}

// base

export function convertDocumentSpanToLocation(documentSpan: ts.DocumentSpan, ctx: SharedContext): vscode.Location {
	const uri = ctx.fileNameToUri(documentSpan.fileName);
	const document = ctx.getTextDocument(uri);
	const range = convertTextSpan(documentSpan.textSpan, document);
	return {
		uri: uri.toString(),
		range,
	};
}

export function convertDefinitionInfoAndBoundSpan(info: ts.DefinitionInfoAndBoundSpan, document: TextDocument, ctx: SharedContext): vscode.LocationLink[] {
	if (!info.definitions) {
		return [];
	}
	const originSelectionRange = convertTextSpan(info.textSpan, document);
	return info.definitions
		.map(entry => {
			const link = convertDocumentSpantoLocationLink(entry, ctx);
			if (link) {
				link.originSelectionRange ??= originSelectionRange;
				return link;
			}
		})
		.filter(entry => !!entry);
}

export function convertDocumentSpantoLocationLink(documentSpan: ts.DocumentSpan, ctx: SharedContext): vscode.LocationLink {
	const targetUri = ctx.fileNameToUri(documentSpan.fileName);
	const document = ctx.getTextDocument(targetUri);
	const targetSelectionRange = convertTextSpan(documentSpan.textSpan, document);
	const targetRange = documentSpan.contextSpan
		? convertTextSpan(documentSpan.contextSpan, document)
		: targetSelectionRange;
	const originSelectionRange = documentSpan.originalTextSpan
		? convertTextSpan(documentSpan.originalTextSpan, document)
		: undefined;
	return {
		targetUri: targetUri.toString(),
		targetRange,
		targetSelectionRange,
		originSelectionRange,
	};
}

export function convertTextSpan(textSpan: ts.TextSpan, document: TextDocument | undefined): vscode.Range {
	if (!document) {
		return {
			start: { line: 0, character: 0 },
			end: { line: 0, character: 0 },
		};
	}
	return {
		start: document.positionAt(textSpan.start),
		end: document.positionAt(textSpan.start + textSpan.length),
	};
}
