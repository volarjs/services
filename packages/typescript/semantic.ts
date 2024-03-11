import type {
	CancellationToken,
	CompletionItemKind,
	DocumentHighlight,
	FileChangeType,
	InsertTextFormat,
	Location,
	ParameterInformation,
	Result,
	ServiceContext,
	ServicePlugin,
	ServicePluginInstance,
	SignatureHelpTriggerKind,
	SignatureInformation,
	VirtualCode,
	WorkspaceEdit
} from '@volar/language-service';
import * as path from 'path-browserify';
import * as semver from 'semver';
import type * as ts from 'typescript';
import * as tsWithImportCache from 'typescript-auto-import-cache';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { getFormatCodeSettings } from './lib/configs/getFormatCodeSettings';
import { getUserPreferences } from './lib/configs/getUserPreferences';
import { getConfigTitle, isJsonDocument, isTsDocument, notEmpty, safeCall } from './lib/shared';
import {
	applyCompletionEntryDetails,
	convertCallHierarchyIncomingCall,
	convertCallHierarchyItem,
	convertCallHierarchyOutgoingCall,
	convertCompletionInfo,
	convertDefinitionInfoAndBoundSpan,
	convertDiagnostic,
	convertDocumentSpanToLocation,
	convertDocumentSpantoLocationLink,
	convertFileTextChanges,
	convertHighlightSpan,
	convertInlayHint,
	convertNavigateToItem,
	convertQuickInfo,
	convertRenameLocations,
	convertSelectionRange,
	convertTextSpan,
	getLineText
} from './lib/utils/lspConverters';
import { snippetForFunctionCall } from './lib/utils/snippetForFunctionCall';
import * as codeActions from './lib/semanticFeatures/codeAction';
import * as codeActionResolve from './lib/semanticFeatures/codeActionResolve';
import * as semanticTokens from './lib/semanticFeatures/semanticTokens';
import type { SharedContext } from './lib/semanticFeatures/types';

export interface Provide {
	'typescript/languageService': () => ts.LanguageService;
	'typescript/languageServiceHost': () => ts.LanguageServiceHost;
}

export interface CompletionItemData {
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

const documentRegistries: [boolean, string, ts.DocumentRegistry][] = [];

function getDocumentRegistry(ts: typeof import('typescript'), useCaseSensitiveFileNames: boolean, currentDirectory: string) {
	let documentRegistry = documentRegistries.find(item => item[0] === useCaseSensitiveFileNames && item[1] === currentDirectory)?.[2];
	if (!documentRegistry) {
		documentRegistry = ts.createDocumentRegistry(useCaseSensitiveFileNames, currentDirectory);
		documentRegistries.push([useCaseSensitiveFileNames, currentDirectory, documentRegistry]);
	}
	return documentRegistry;
}

export function create(
	ts: typeof import('typescript'),
	{
		isValidationEnabled = async (document, context) => {
			return await context.env.getConfiguration?.<boolean>(getConfigTitle(document) + '.validate.enable') ?? true;
		},
		isSuggestionsEnabled = async (document, context) => {
			return await context.env.getConfiguration?.<boolean>(getConfigTitle(document) + '.suggest.enabled') ?? true;
		},
	}: {
		isValidationEnabled?(document: TextDocument, context: ServiceContext): Result<boolean>;
		isSuggestionsEnabled?(document: TextDocument, context: ServiceContext): Result<boolean>;
	} = {},
): ServicePlugin {
	return {
		name: 'typescript-semantic',
		triggerCharacters: getBasicTriggerCharacters(ts.version),
		signatureHelpTriggerCharacters: ['(', ',', '<'],
		signatureHelpRetriggerCharacters: [')'],
		create(context): ServicePluginInstance<Provide> {
			if (!context.language.typescript) {
				return {};
			}
			const { sys, languageServiceHost } = context.language.typescript;
			const created = tsWithImportCache.createLanguageService(
				ts,
				sys,
				languageServiceHost,
				proxiedHost => ts.createLanguageService(proxiedHost, getDocumentRegistry(ts, sys.useCaseSensitiveFileNames, languageServiceHost.getCurrentDirectory())),
			);
			const { languageService } = created;

			if (created.setPreferences && context.env.getConfiguration) {

				updatePreferences();
				context.env.onDidChangeConfiguration?.(updatePreferences);

				async function updatePreferences() {
					const preferences = await context.env.getConfiguration?.<ts.UserPreferences>('typescript.preferences');
					if (preferences) {
						created.setPreferences?.(preferences);
					}
				}
			}

			if (created.projectUpdated) {

				const sourceScriptNames = new Set<string>();
				const normalizeFileName = sys.useCaseSensitiveFileNames
					? (id: string) => id
					: (id: string) => id.toLowerCase();

				updateSourceScriptFileNames();

				context.env.onDidChangeWatchedFiles?.((params) => {
					const someFileCreateOrDeiete = params.changes.some(change => change.type !== 2 satisfies typeof FileChangeType.Changed);
					if (someFileCreateOrDeiete) {
						updateSourceScriptFileNames();
					}
					for (const change of params.changes) {
						const fileName = context.env.typescript!.uriToFileName(change.uri);
						if (sourceScriptNames.has(normalizeFileName(fileName))) {
							created.projectUpdated?.(languageServiceHost.getCurrentDirectory());
						}
					}
				});

				function updateSourceScriptFileNames() {
					sourceScriptNames.clear();
					for (const fileName of languageServiceHost.getScriptFileNames()) {
						const uri = context.env.typescript!.fileNameToUri(fileName);
						const sourceFile = context.language.files.get(uri);
						if (sourceFile?.generated) {
							const tsCode = sourceFile.generated.languagePlugin.typescript?.getScript(sourceFile.generated.code);
							if (tsCode) {
								sourceScriptNames.add(normalizeFileName(fileName));
							}
						}
						else if (sourceFile) {
							sourceScriptNames.add(normalizeFileName(fileName));
						}
					}
				}
			}

			const ctx: SharedContext = {
				...context,
				languageServiceHost,
				languageService,
				uriToFileName(uri) {
					const virtualScript = getVirtualScriptByUri(uri);
					if (virtualScript) {
						return virtualScript.fileName;
					}
					return context.env.typescript!.uriToFileName(uri);
				},
				fileNameToUri(fileName) {

					const uri = context.env.typescript!.fileNameToUri(fileName);
					const sourceFile = context.language.files.get(uri);
					const extraScript = context.language.typescript!.getExtraScript(fileName);

					let virtualCode = extraScript?.code;

					if (!virtualCode && sourceFile?.generated?.languagePlugin.typescript) {
						const mainScript = sourceFile.generated.languagePlugin.typescript.getScript(sourceFile.generated.code);
						if (mainScript) {
							virtualCode = mainScript.code;
						}
					}
					if (virtualCode) {
						const sourceFile = context.language.files.getByVirtualCode(virtualCode);
						return context.documents.getVirtualCodeUri(sourceFile.id, virtualCode.id);
					}

					return uri;
				},
				getTextDocument(uri) {
					const virtualCode = context.documents.getVirtualCodeByUri(uri)[0];
					if (virtualCode) {
						return context.documents.get(uri, virtualCode.languageId, virtualCode.snapshot);
					}
					const sourceFile = context.language.files.get(uri);
					if (sourceFile) {
						return context.documents.get(uri, sourceFile.languageId, sourceFile.snapshot);
					}
					throw new Error(`getTextDocument: uri not found: ${uri}`);
				},
			};
			const getCodeActions = codeActions.register(ctx);
			const doCodeActionResolve = codeActionResolve.register(ctx);
			const getDocumentSemanticTokens = semanticTokens.register(ts, ctx);

			/* typescript-language-features is hardcode true */
			const renameInfoOptions = { allowRenameOfImportPath: true };

			return {

				provide: {
					'typescript/languageService': () => languageService,
					'typescript/languageServiceHost': () => languageServiceHost,
				},

				dispose() {
					languageService.dispose();
				},

				async provideCompletionItems(document, position, completeContext, token) {

					if (!isSemanticDocument(document))
						return;

					if (!await isSuggestionsEnabled(document, context))
						return;

					return await worker(token, async () => {

						const preferences = await getUserPreferences(ctx, document);
						const fileName = ctx.uriToFileName(document.uri);
						const offset = document.offsetAt(position);
						const info = safeCall(() => ctx.languageService.getCompletionsAtPosition(fileName, offset, {
							...preferences,
							triggerCharacter: completeContext.triggerCharacter as ts.CompletionsTriggerCharacter,
							triggerKind: completeContext.triggerKind,
						}));
						if (info) {
							return convertCompletionInfo<CompletionItemData>(
								ts,
								info,
								document,
								position,
								tsEntry => ({
									uri: document.uri,
									fileName,
									offset,
									originalItem: {
										name: tsEntry.name,
										source: tsEntry.source,
										data: tsEntry.data,
										labelDetails: tsEntry.labelDetails,
									},
								}),
							);
						}
					});
				},

				async resolveCompletionItem(item, token) {
					return await worker(token, async () => {
						const data: CompletionItemData | undefined = item.data;
						if (!data) {
							return item;
						}
						const { fileName, offset } = data;
						const document = ctx.getTextDocument(data.uri);
						const [formatOptions, preferences] = await Promise.all([
							getFormatCodeSettings(ctx, document),
							getUserPreferences(ctx, document),
						]);
						const details = safeCall(() => ctx.languageService.getCompletionEntryDetails(fileName, offset, data.originalItem.name, formatOptions, data.originalItem.source, preferences, data.originalItem.data));
						if (!details) {
							return item;
						}
						if (data.originalItem.labelDetails) {
							item.labelDetails ??= {};
							Object.assign(item.labelDetails, data.originalItem.labelDetails);
						}
						applyCompletionEntryDetails(
							ts,
							item,
							details,
							document,
							ctx.fileNameToUri,
							ctx.getTextDocument,
						);
						const useCodeSnippetsOnMethodSuggest = await ctx.env.getConfiguration?.<boolean>(getConfigTitle(document) + '.suggest.completeFunctionCalls') ?? false;
						const useCodeSnippet = useCodeSnippetsOnMethodSuggest
							&& (
								item.kind === 3 satisfies typeof CompletionItemKind.Function
								|| item.kind === 2 satisfies typeof CompletionItemKind.Method
							);
						if (useCodeSnippet) {
							const shouldCompleteFunction = isValidFunctionCompletionContext(ctx.languageService, fileName, offset, document);
							if (shouldCompleteFunction) {
								const { snippet, parameterCount } = snippetForFunctionCall(
									{
										insertText: item.insertText ?? item.textEdit?.newText, // insertText is dropped by LSP in some case: https://github.com/microsoft/vscode-languageserver-node/blob/9b742021fb04ad081aa3676a9eecf4fa612084b4/client/src/common/codeConverter.ts#L659-L664
										label: item.label,
									},
									details.displayParts,
								);
								if (item.textEdit) {
									item.textEdit.newText = snippet;
								}
								if (item.insertText) {
									item.insertText = snippet;
								}
								item.insertTextFormat = 2 satisfies typeof InsertTextFormat.Snippet;
								if (parameterCount > 0) {
									//Fix for https://github.com/microsoft/vscode/issues/104059
									//Don't show parameter hints if "editor.parameterHints.enabled": false
									// if (await getConfiguration('editor.parameterHints.enabled', document.uri)) {
									// 	item.command = {
									// 		title: 'triggerParameterHints',
									// 		command: 'editor.action.triggerParameterHints',
									// 	};
									// }
								}
							}
						}
						return item;

						function isValidFunctionCompletionContext(
							client: ts.LanguageService,
							filepath: string,
							offset: number,
							document: TextDocument,
						): boolean {
							// Workaround for https://github.com/microsoft/TypeScript/issues/12677
							// Don't complete function calls inside of destructive assignments or imports
							try {
								const response = client.getQuickInfoAtPosition(filepath, offset);
								if (response) {
									switch (response.kind) {
										case 'var':
										case 'let':
										case 'const':
										case 'alias':
											return false;
									}
								}
							} catch {
								// Noop
							}

							// Don't complete function call if there is already something that looks like a function call
							// https://github.com/microsoft/vscode/issues/18131
							const position = document.positionAt(offset);
							const after = getLineText(document, position.line).slice(position.character);
							return after.match(/^[a-z_$0-9]*\s*\(/gi) === null;
						}
					}) ?? item;
				},

				provideRenameRange(document, position, token) {

					if (!isSemanticDocument(document))
						return;

					return worker(token, () => {
						const fileName = ctx.uriToFileName(document.uri);
						const offset = document.offsetAt(position);
						const renameInfo = safeCall(() => ctx.languageService.getRenameInfo(fileName, offset, renameInfoOptions));
						if (!renameInfo) {
							return;
						}
						if (!renameInfo.canRename) {
							return { message: renameInfo.localizedErrorMessage };
						}
						return convertTextSpan(renameInfo.triggerSpan, document);
					});
				},

				provideRenameEdits(document, position, newName, token) {

					if (!isSemanticDocument(document, true))
						return;

					return worker(token, async () => {
						const fileName = ctx.uriToFileName(document.uri);
						const offset = document.offsetAt(position);
						const renameInfo = safeCall(() => ctx.languageService.getRenameInfo(fileName, offset, renameInfoOptions));
						if (!renameInfo?.canRename) {
							return;
						}
						if (renameInfo.fileToRename) {
							const [formatOptions, preferences] = await Promise.all([
								getFormatCodeSettings(ctx, document),
								getUserPreferences(ctx, document),
							]);
							return renameFile(renameInfo.fileToRename, newName, formatOptions, preferences);
						}

						const { providePrefixAndSuffixTextForRename } = await getUserPreferences(ctx, document);
						const entries = ctx.languageService.findRenameLocations(fileName, offset, false, false, providePrefixAndSuffixTextForRename);
						if (!entries) {
							return;
						}
						return convertRenameLocations(newName, entries, ctx.fileNameToUri, ctx.getTextDocument);

						function renameFile(
							fileToRename: string,
							newName: string,
							formatOptions: ts.FormatCodeSettings,
							preferences: ts.UserPreferences,
						): WorkspaceEdit | undefined {
							// Make sure we preserve file extension if none provided
							if (!path.extname(newName)) {
								newName += path.extname(fileToRename);
							}
							const dirname = path.dirname(fileToRename);
							const newFilePath = path.join(dirname, newName);
							const response = safeCall(() => ctx.languageService.getEditsForFileRename(fileToRename, newFilePath, formatOptions, preferences));
							if (!response) {
								return;
							}
							const edits = convertFileTextChanges(response, ctx.fileNameToUri, ctx.getTextDocument);
							if (!edits.documentChanges) {
								edits.documentChanges = [];
							}
							edits.documentChanges.push({
								kind: 'rename',
								oldUri: ctx.fileNameToUri(fileToRename),
								newUri: ctx.fileNameToUri(newFilePath),
							});
							return edits;
						}
					});
				},

				provideCodeActions(document, range, context, token) {

					if (!isSemanticDocument(document))
						return;

					return worker(token, () => {
						return getCodeActions(document, range, context);
					});
				},

				async resolveCodeAction(codeAction, token) {
					return await worker(token, () => {
						return doCodeActionResolve(codeAction);
					}) ?? codeAction;
				},

				provideInlayHints(document, range, token) {

					if (!isSemanticDocument(document))
						return;

					return worker(token, async () => {
						const preferences = await getUserPreferences(ctx, document);
						const fileName = ctx.uriToFileName(document.uri);
						const start = document.offsetAt(range.start);
						const end = document.offsetAt(range.end);
						const inlayHints = safeCall(() =>
							'provideInlayHints' in ctx.languageService
								? ctx.languageService.provideInlayHints(fileName, { start, length: end - start }, preferences)
								: []
						);
						if (!inlayHints) {
							return [];
						}
						return inlayHints.map(hint => convertInlayHint(hint, document));
					});
				},

				provideCallHierarchyItems(document, position, token) {

					if (!isSemanticDocument(document))
						return;

					return worker(token, () => {
						const fileName = ctx.uriToFileName(document.uri);
						const offset = document.offsetAt(position);
						const calls = safeCall(() => ctx.languageService.prepareCallHierarchy(fileName, offset));
						if (!calls) {
							return [];
						}
						const items = Array.isArray(calls) ? calls : [calls];
						return items.map(item => convertCallHierarchyItem(item, ctx));
					});
				},

				async provideCallHierarchyIncomingCalls(item, token) {
					return await worker(token, () => {
						const document = ctx.getTextDocument(item.uri);
						const fileName = ctx.uriToFileName(item.uri);
						const offset = document.offsetAt(item.selectionRange.start);
						const calls = safeCall(() => ctx.languageService.provideCallHierarchyIncomingCalls(fileName, offset));
						if (!calls) {
							return [];
						}
						const items = Array.isArray(calls) ? calls : [calls];
						return items.map(item => convertCallHierarchyIncomingCall(item, ctx));
					}) ?? [];
				},

				async provideCallHierarchyOutgoingCalls(item, token) {
					return await worker(token, () => {
						const document = ctx.getTextDocument(item.uri);
						const fileName = ctx.uriToFileName(item.uri);
						const offset = document.offsetAt(item.selectionRange.start);
						const calls = safeCall(() => ctx.languageService.provideCallHierarchyOutgoingCalls(fileName, offset));
						if (!calls) {
							return [];
						}
						const items = Array.isArray(calls) ? calls : [calls];
						return items.map(item => convertCallHierarchyOutgoingCall(item, document, ctx));
					}) ?? [];
				},

				provideDefinition(document, position, token) {

					if (!isSemanticDocument(document))
						return;

					return worker(token, () => {
						const fileName = ctx.uriToFileName(document.uri);
						const offset = document.offsetAt(position);
						const info = safeCall(() => ctx.languageService.getDefinitionAndBoundSpan(fileName, offset));
						if (!info) {
							return [];
						}
						return convertDefinitionInfoAndBoundSpan(info, document, ctx);
					});
				},

				provideTypeDefinition(document, position, token) {

					if (!isSemanticDocument(document))
						return;

					return worker(token, () => {
						const fileName = ctx.uriToFileName(document.uri);
						const offset = document.offsetAt(position);
						const entries = safeCall(() => ctx.languageService.getTypeDefinitionAtPosition(fileName, offset));
						if (!entries) {
							return [];
						}
						return entries.map(entry => convertDocumentSpantoLocationLink(entry, ctx));
					});
				},

				async provideDiagnostics(document, token) {
					return provideDiagnosticsWorker(document, token, 'syntactic');
				},

				async provideSemanticDiagnostics(document, token) {
					return provideDiagnosticsWorker(document, token, 'semantic');
				},

				provideHover(document, position, token) {

					if (!isSemanticDocument(document))
						return;

					return worker(token, () => {
						const fileName = ctx.uriToFileName(document.uri);
						const offset = document.offsetAt(position);
						const info = safeCall(() => ctx.languageService.getQuickInfoAtPosition(fileName, offset));
						if (!info) {
							return;
						}
						return convertQuickInfo(ts, info, document, ctx.fileNameToUri, ctx.getTextDocument);
					});
				},

				provideImplementation(document, position, token) {

					if (!isSemanticDocument(document))
						return;

					return worker(token, () => {
						const fileName = ctx.uriToFileName(document.uri);
						const offset = document.offsetAt(position);
						const entries = safeCall(() => ctx.languageService.getImplementationAtPosition(fileName, offset));
						if (!entries) {
							return [];
						}
						return entries.map(entry => convertDocumentSpantoLocationLink(entry, ctx));
					});
				},

				provideReferences(document, position, referenceContext, token) {

					if (!isSemanticDocument(document, true))
						return;

					return worker(token, () => {
						const fileName = ctx.uriToFileName(document.uri);
						const offset = document.offsetAt(position);
						const references = safeCall(() => ctx.languageService.findReferences(fileName, offset));
						if (!references) {
							return [];
						}
						const result: Location[] = [];
						for (const reference of references) {
							if (referenceContext.includeDeclaration) {
								const definition = convertDocumentSpanToLocation(reference.definition, ctx);
								if (definition) {
									result.push(definition);
								}
							}
							for (const referenceEntry of reference.references) {
								const reference = convertDocumentSpanToLocation(referenceEntry, ctx);
								if (reference) {
									result.push(reference);
								}
							}
						}
						return result;
					});
				},

				provideFileReferences(document, token) {

					if (!isSemanticDocument(document, true))
						return;

					return worker(token, () => {
						const fileName = ctx.uriToFileName(document.uri);
						const entries = safeCall(() => ctx.languageService.getFileReferences(fileName));
						if (!entries) {
							return [];
						}
						return entries.map(entry => convertDocumentSpanToLocation(entry, ctx));
					});
				},

				provideDocumentHighlights(document, position, token) {

					if (!isSemanticDocument(document))
						return;

					return worker(token, () => {
						const fileName = ctx.uriToFileName(document.uri);
						const offset = document.offsetAt(position);
						const highlights = safeCall(() => ctx.languageService.getDocumentHighlights(fileName, offset, [fileName]));
						if (!highlights) {
							return [];
						}
						const results: DocumentHighlight[] = [];
						for (const highlight of highlights) {
							for (const span of highlight.highlightSpans) {
								results.push(convertHighlightSpan(span, document));
							}
						}
						return results;
					});
				},

				provideDocumentSemanticTokens(document, range, legend, token) {

					if (!isSemanticDocument(document))
						return;

					return worker(token, () => {
						return getDocumentSemanticTokens(document, range, legend);
					});
				},

				provideWorkspaceSymbols(query, token) {
					return worker(token, () => {
						const items = safeCall(() => ctx.languageService.getNavigateToItems(query));
						if (!items) {
							return [];
						}
						return items
							.filter(item => item.containerName || item.kind !== 'alias')
							.map(item => convertNavigateToItem(item, ctx.getTextDocument(ctx.fileNameToUri(item.fileName))))
							.filter(notEmpty);
					});
				},

				provideFileRenameEdits(oldUri, newUri, token) {
					return worker(token, async () => {
						const document = ctx.getTextDocument(oldUri);
						const [formatOptions, preferences] = await Promise.all([
							getFormatCodeSettings(ctx, document),
							getUserPreferences(ctx, document),
						]);

						const fileToRename = ctx.uriToFileName(oldUri);
						const newFilePath = ctx.uriToFileName(newUri);
						const response = safeCall(() => ctx.languageService.getEditsForFileRename(fileToRename, newFilePath, formatOptions, preferences));
						if (!response?.length) {
							return;
						}

						return convertFileTextChanges(response, ctx.fileNameToUri, ctx.getTextDocument);
					});
				},

				provideSelectionRanges(document, positions, token) {

					if (!isSemanticDocument(document))
						return;

					return worker(token, () => {
						return positions
							.map(position => {
								const fileName = ctx.uriToFileName(document.uri);
								const offset = document.offsetAt(position);
								const range = safeCall(() => ctx.languageService.getSmartSelectionRange(fileName, offset));
								if (!range) {
									return;
								}
								return convertSelectionRange(range, document);
							})
							.filter(notEmpty);
					});
				},

				provideSignatureHelp(document, position, context, token) {

					if (!isSemanticDocument(document))
						return;

					return worker(token, () => {
						const options: ts.SignatureHelpItemsOptions = {};
						if (context?.triggerKind === 1 satisfies typeof SignatureHelpTriggerKind.Invoked) {
							options.triggerReason = {
								kind: 'invoked'
							};
						}
						else if (context?.triggerKind === 2 satisfies typeof SignatureHelpTriggerKind.TriggerCharacter) {
							options.triggerReason = {
								kind: 'characterTyped',
								triggerCharacter: context.triggerCharacter as ts.SignatureHelpTriggerCharacter,
							};
						}
						else if (context?.triggerKind === 3 satisfies typeof SignatureHelpTriggerKind.ContentChange) {
							options.triggerReason = {
								kind: 'retrigger',
								triggerCharacter: context.triggerCharacter as ts.SignatureHelpRetriggerCharacter,
							};
						}

						const fileName = ctx.uriToFileName(document.uri);
						const offset = document.offsetAt(position);
						const helpItems = safeCall(() => ctx.languageService.getSignatureHelpItems(fileName, offset, options));
						if (!helpItems) {
							return;
						}

						return {
							activeSignature: helpItems.selectedItemIndex,
							activeParameter: helpItems.argumentIndex,
							signatures: helpItems.items.map(item => {
								const signature: SignatureInformation = {
									label: '',
									documentation: undefined,
									parameters: []
								};
								signature.label += ts.displayPartsToString(item.prefixDisplayParts);
								item.parameters.forEach((p, i, a) => {
									const label = ts.displayPartsToString(p.displayParts);
									const parameter: ParameterInformation = {
										label,
										documentation: ts.displayPartsToString(p.documentation)
									};
									signature.label += label;
									signature.parameters!.push(parameter);
									if (i < a.length - 1) {
										signature.label += ts.displayPartsToString(item.separatorDisplayParts);
									}
								});
								signature.label += ts.displayPartsToString(item.suffixDisplayParts);
								return signature;
							}),
						};
					});
				},
			};

			async function provideDiagnosticsWorker(document: TextDocument, token: CancellationToken, mode: 'syntactic' | 'semantic') {

				if (!isSemanticDocument(document))
					return;

				if (!await isValidationEnabled(document, context))
					return;

				return await worker(token, () => {
					const fileName = ctx.uriToFileName(document.uri);
					const program = ctx.languageService.getProgram();
					const sourceFile = program?.getSourceFile(fileName);
					if (!program || !sourceFile) {
						return [];
					}
					const token: ts.CancellationToken = {
						isCancellationRequested() {
							return ctx.language.typescript?.languageServiceHost.getCancellationToken?.().isCancellationRequested() ?? false;
						},
						throwIfCancellationRequested() { },
					};
					if (mode === 'syntactic') {
						const syntacticDiagnostics = safeCall(() => program.getSyntacticDiagnostics(sourceFile, token)) ?? [];
						const suggestionDiagnostics = safeCall(() => ctx.languageService.getSuggestionDiagnostics(fileName)) ?? [];

						return [...syntacticDiagnostics, ...suggestionDiagnostics]
							.map(diagnostic => convertDiagnostic(diagnostic, document, ctx.fileNameToUri, ctx.getTextDocument))
							.filter(notEmpty);
					}
					else if (mode === 'semantic') {
						const semanticDiagnostics = safeCall(() => program.getSemanticDiagnostics(sourceFile, token)) ?? [];
						const declarationDiagnostics = getEmitDeclarations(program.getCompilerOptions())
							? safeCall(() => program.getDeclarationDiagnostics(sourceFile, token)) ?? []
							: [];

						return [...semanticDiagnostics, ...declarationDiagnostics]
							.map(diagnostic => convertDiagnostic(diagnostic, document, ctx.fileNameToUri, ctx.getTextDocument))
							.filter(notEmpty);
					}
				});
			}

			function getEmitDeclarations(compilerOptions: ts.CompilerOptions): boolean {
				return !!(compilerOptions.declaration || compilerOptions.composite);
			}

			function isSemanticDocument(document: TextDocument, withJson = false) {
				const virtualScript = getVirtualScriptByUri(document.uri);
				if (virtualScript) {
					return true;
				}
				if (withJson && isJsonDocument(document)) {
					return true;
				}
				return isTsDocument(document);
			}

			async function worker<T>(token: CancellationToken, fn: () => T): Promise<Awaited<T> | undefined> {
				let result: Awaited<T> | undefined;
				let oldSysVersion: number | undefined;
				let newSysVersion = await sys.sync?.();
				do {
					oldSysVersion = newSysVersion;
					try {
						result = await fn();
					} catch (err) {
						console.warn(err);
						break;
					}
					newSysVersion = await sys.sync?.();
				} while (newSysVersion !== oldSysVersion && !token.isCancellationRequested);
				return result;
			}

			function getVirtualScriptByUri(uri: string): {
				fileName: string;
				code: VirtualCode;
			} | undefined {
				const [virtualCode, sourceFile] = context.documents.getVirtualCodeByUri(uri);
				if (virtualCode && sourceFile.generated?.languagePlugin.typescript) {
					const { getScript, getExtraScripts } = sourceFile.generated?.languagePlugin.typescript;
					const sourceFileName = context.env.typescript!.uriToFileName(sourceFile.id);
					if (getScript(sourceFile.generated.code)?.code === virtualCode) {
						return {
							fileName: sourceFileName,
							code: virtualCode,
						};
					}
					for (const extraScript of getExtraScripts?.(sourceFileName, sourceFile.generated.code) ?? []) {
						if (extraScript.code === virtualCode) {
							return extraScript;
						}
					}
				}
			}
		},
	};
}

function getBasicTriggerCharacters(tsVersion: string) {

	const triggerCharacters = ['.', '"', '\'', '`', '/', '<'];

	// https://github.com/microsoft/vscode/blob/8e65ae28d5fb8b3c931135da1a41edb9c80ae46f/extensions/typescript-language-features/src/languageFeatures/completions.ts#L811-L833
	if (semver.lt(tsVersion, '3.1.0') || semver.gte(tsVersion, '3.2.0')) {
		triggerCharacters.push('@');
	}
	if (semver.gte(tsVersion, '3.8.1')) {
		triggerCharacters.push('#');
	}
	if (semver.gte(tsVersion, '4.3.0')) {
		triggerCharacters.push(' ');
	}

	return triggerCharacters;
}
