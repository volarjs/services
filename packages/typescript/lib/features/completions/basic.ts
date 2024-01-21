import type * as vscode from '@volar/language-service';
import * as semver from 'semver';
import type * as ts from 'typescript';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { getUserPreferences } from '../../configs/getUserPreferences';
import * as PConst from '../../protocol.const';
import { safeCall } from '../../shared';
import type { SharedContext } from '../../types';
import { parseKindModifier } from '../../utils/modifiers';

export interface Data {
	uri: string,
	fileName: string,
	offset: number,
	originalItem: {
		name: ts.CompletionEntry['name'],
		source: ts.CompletionEntry['source'],
		data: ts.CompletionEntry['data'],
		labelDetails: ts.CompletionEntry['labelDetails'],
	};
}

export function register(ctx: SharedContext) {

	const { ts } = ctx;
	const lt_320 = semver.lt(ts.version, '3.2.0');
	const gte_300 = semver.gte(ts.version, '3.0.0');

	return async (uri: string, position: vscode.Position, options?: ts.GetCompletionsAtPositionOptions): Promise<vscode.CompletionList | undefined> => {

		const document = ctx.getTextDocument(uri);
		if (!document)
			return;

		const preferences = await getUserPreferences(ctx, document);
		const fileName = ctx.uriToFileName(document.uri);
		const offset = document.offsetAt(position);
		const completionContext = safeCall(() => ctx.languageService.getCompletionsAtPosition(fileName, offset, {
			...preferences,
			...options,
		}));

		if (completionContext === undefined)
			return;

		const wordRange: vscode.Range | undefined = completionContext.optionalReplacementSpan ? {
			start: document.positionAt(completionContext.optionalReplacementSpan.start),
			end: document.positionAt(completionContext.optionalReplacementSpan.start + completionContext.optionalReplacementSpan.length),
		} : undefined;

		let line = document.getText({
			start: { line: position.line, character: 0 },
			end: { line: position.line + 1, character: 0 },
		});
		if (line.endsWith('\n')) {
			line = line.substring(0, line.length - 1);
		}

		const dotAccessorContext = getDotAccessorContext(document);

		const entries = completionContext.entries
			.map(tsEntry => toVScodeItem(tsEntry, document));

		return {
			isIncomplete: !!completionContext.isIncomplete,
			items: entries,
		};

		function toVScodeItem(tsEntry: ts.CompletionEntry, document: TextDocument) {

			const item: vscode.CompletionItem = { label: tsEntry.name };

			item.kind = convertKind(tsEntry.kind);

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
				isNewIdentifierLocation: completionContext!.isNewIdentifierLocation,
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

			return {
				...item,
				data: {
					uri,
					fileName,
					offset,
					originalItem: {
						name: tsEntry.name,
						source: tsEntry.source,
						data: tsEntry.data,
						labelDetails: tsEntry.labelDetails,
					},
				} satisfies Data,
			};
		}

		function getDotAccessorContext(document: TextDocument) {
			let dotAccessorContext: {
				range: vscode.Range;
				text: string;
			} | undefined;

			if (gte_300) {

				if (!completionContext)
					return;

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

		function convertKind(kind: string): vscode.CompletionItemKind {
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
			position: vscode.Position,
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
	};
}

export function handleKindModifiers(item: vscode.CompletionItem, tsEntry: ts.CompletionEntry | ts.CompletionEntryDetails) {
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
