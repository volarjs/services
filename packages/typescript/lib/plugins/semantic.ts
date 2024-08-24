import type {
	CancellationToken,
	CodeActionKind,
	CompletionItemKind,
	DocumentHighlight,
	FileChangeType,
	FormattingOptions,
	InsertTextFormat,
	LanguageServiceContext,
	LanguageServicePlugin,
	LanguageServicePluginInstance,
	Location,
	ParameterInformation,
	ProviderResult,
	SignatureHelpTriggerKind,
	SignatureInformation,
	VirtualCode,
	WorkspaceEdit,
} from '@volar/language-service';
import * as path from 'path-browserify';
import * as semver from 'semver';
import type * as ts from 'typescript';
import * as tsWithImportCache from 'typescript-auto-import-cache';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { getFormatCodeSettings } from '../configs/getFormatCodeSettings';
import { getUserPreferences } from '../configs/getUserPreferences';
import * as codeActions from '../semanticFeatures/codeAction';
import * as codeActionResolve from '../semanticFeatures/codeActionResolve';
import * as semanticTokens from '../semanticFeatures/semanticTokens';
import type { SharedContext } from '../semanticFeatures/types';
import { getConfigTitle, isJsonDocument, isTsDocument, safeCall } from '../shared';
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
	convertTextSpan,
	getLineText
} from '../utils/lspConverters';
import { snippetForFunctionCall } from '../utils/snippetForFunctionCall';

export interface Provide {
	'typescript/languageService': () => ts.LanguageService;
	'typescript/languageServiceHost': () => ts.LanguageServiceHost;
	'typescript/documentFileName': (uri: URI) => string;
	'typescript/documentUri': (fileName: string) => URI;
}

export interface CompletionItemData {
	uri: string;
	fileName: string;
	offset: number;
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
		disableAutoImportCache = false,
		isValidationEnabled = async (document, context) => {
			return await context.env.getConfiguration?.<boolean>(getConfigTitle(document) + '.validate.enable') ?? true;
		},
		isSuggestionsEnabled = async (document, context) => {
			return await context.env.getConfiguration?.<boolean>(getConfigTitle(document) + '.suggest.enabled') ?? true;
		},
	}: {
		disableAutoImportCache?: boolean;
		isValidationEnabled?(document: TextDocument, context: LanguageServiceContext): ProviderResult<boolean>;
		isSuggestionsEnabled?(document: TextDocument, context: LanguageServiceContext): ProviderResult<boolean>;
	} = {}
): LanguageServicePlugin {
	return {
		name: 'typescript-semantic',
		capabilities: {
			completionProvider: {
				triggerCharacters: getBasicTriggerCharacters(ts.version),
				resolveProvider: true,
			},
			renameProvider: {
				prepareProvider: true,
			},
			fileRenameEditsProvider: true,
			codeActionProvider: {
				codeActionKinds: [
					'' satisfies typeof CodeActionKind.Empty,
					'quickfix' satisfies typeof CodeActionKind.QuickFix,
					'refactor' satisfies typeof CodeActionKind.Refactor,
					'refactor.extract' satisfies typeof CodeActionKind.RefactorExtract,
					'refactor.inline' satisfies typeof CodeActionKind.RefactorInline,
					'refactor.rewrite' satisfies typeof CodeActionKind.RefactorRewrite,
					'source' satisfies typeof CodeActionKind.Source,
					'source.fixAll' satisfies typeof CodeActionKind.SourceFixAll,
					'source.organizeImports' satisfies typeof CodeActionKind.SourceOrganizeImports,
				],
				resolveProvider: true,
			},
			inlayHintProvider: {},
			callHierarchyProvider: true,
			definitionProvider: true,
			typeDefinitionProvider: true,
			diagnosticProvider: {
				interFileDependencies: true,
				workspaceDiagnostics: false,
			},
			hoverProvider: true,
			implementationProvider: true,
			referencesProvider: true,
			fileReferencesProvider: true,
			documentHighlightProvider: true,
			semanticTokensProvider: {
				// https://code.visualstudio.com/api/language-extensions/semantic-highlight-guide#standard-token-types-and-modifiers
				legend: {
					tokenTypes: [
						'namespace',
						'class',
						'enum',
						'interface',
						'typeParameter',
						'type',
						'parameter',
						'variable',
						'property',
						'enumMember',
						'function',
						'method',
					],
					tokenModifiers: [
						'declaration',
						'readonly',
						'static',
						'async',
						'defaultLibrary',
						'local', // additional
					],
				},
			},
			workspaceSymbolProvider: {},
			signatureHelpProvider: {
				triggerCharacters: ['(', ',', '<'],
				retriggerCharacters: [')'],
			},
		},
		create(context): LanguageServicePluginInstance<Provide> {
			if (!context.project.typescript) {
				console.warn(`[volar] typescript-semantic requires typescript project.`);
				return {};
			}
			const { sys, languageServiceHost, uriConverter, getExtraServiceScript } = context.project.typescript;
			let languageService: ts.LanguageService;
			let created: ReturnType<typeof tsWithImportCache.createLanguageService> | undefined;
			if (disableAutoImportCache) {
				languageService = ts.createLanguageService(
					languageServiceHost,
					getDocumentRegistry(ts, sys.useCaseSensitiveFileNames, languageServiceHost.getCurrentDirectory())
				);
			}
			else {
				created = tsWithImportCache.createLanguageService(
					ts,
					sys,
					languageServiceHost,
					proxiedHost => ts.createLanguageService(proxiedHost, getDocumentRegistry(ts, sys.useCaseSensitiveFileNames, languageServiceHost.getCurrentDirectory()))
				);
				languageService = created.languageService;
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
					return uriConverter.asFileName(uri);
				},
				fileNameToUri(fileName) {
					const extraServiceScript = getExtraServiceScript(fileName);
					if (extraServiceScript) {
						const sourceScript = context.language.scripts.fromVirtualCode(extraServiceScript.code);
						return context.encodeEmbeddedDocumentUri(sourceScript.id, extraServiceScript.code.id);
					}

					const uri = uriConverter.asUri(fileName);
					const sourceScript = context.language.scripts.get(uri);
					const serviceScript = sourceScript?.generated?.languagePlugin.typescript?.getServiceScript(sourceScript.generated.root);
					if (sourceScript && serviceScript) {
						return context.encodeEmbeddedDocumentUri(sourceScript.id, serviceScript.code.id);
					}

					return uri;
				},
				getTextDocument(uri) {
					const decoded = context.decodeEmbeddedDocumentUri(uri);
					if (decoded) {
						const sourceScript = context.language.scripts.get(decoded[0]);
						const virtualCode = sourceScript?.generated?.embeddedCodes.get(decoded[1]);
						if (virtualCode) {
							return context.documents.get(uri, virtualCode.languageId, virtualCode.snapshot);
						}
					}
					else {
						const sourceFile = context.language.scripts.get(uri);
						if (sourceFile) {
							return context.documents.get(uri, sourceFile.languageId, sourceFile.snapshot);
						}
					}
				},
			};
			const getCodeActions = codeActions.register(ctx);
			const doCodeActionResolve = codeActionResolve.register(ctx);
			const getDocumentSemanticTokens = semanticTokens.register(ts, ctx);

			/* typescript-language-features is hardcode true */
			const renameInfoOptions = { allowRenameOfImportPath: true };

			let formattingOptions: FormattingOptions | undefined;

			if (created) {
				if (created.setPreferences && context.env.getConfiguration) {

					updatePreferences();
					context.env.onDidChangeConfiguration?.(updatePreferences);

					async function updatePreferences() {
						const preferences = await context.env.getConfiguration?.<ts.UserPreferences>('typescript.preferences');
						if (preferences) {
							created!.setPreferences?.(preferences);
						}
					}
				}
				if (created.projectUpdated) {

					const sourceScriptNames = new Set<string>();
					const normalizeFileName = sys.useCaseSensitiveFileNames
						? (id: string) => id
						: (id: string) => id.toLowerCase();

					updateSourceScriptFileNames();

					context.env.onDidChangeWatchedFiles?.(params => {
						const someFileCreateOrDeiete = params.changes.some(change => change.type !== 2 satisfies typeof FileChangeType.Changed);
						if (someFileCreateOrDeiete) {
							updateSourceScriptFileNames();
						}
						for (const change of params.changes) {
							const fileName = uriConverter.asFileName(URI.parse(change.uri));
							if (sourceScriptNames.has(normalizeFileName(fileName))) {
								created.projectUpdated?.(languageServiceHost.getCurrentDirectory());
							}
						}
					});

					function updateSourceScriptFileNames() {
						sourceScriptNames.clear();
						for (const fileName of languageServiceHost.getScriptFileNames()) {
							const maybeEmbeddedUri = ctx.fileNameToUri(fileName);
							const decoded = context.decodeEmbeddedDocumentUri(maybeEmbeddedUri);
							const uri = decoded ? decoded[0] : maybeEmbeddedUri;
							const sourceScript = context.language.scripts.get(uri);
							if (sourceScript?.generated) {
								const tsCode = sourceScript.generated.languagePlugin.typescript?.getServiceScript(sourceScript.generated.root);
								if (tsCode) {
									sourceScriptNames.add(normalizeFileName(fileName));
								}
							}
							else if (sourceScript) {
								sourceScriptNames.add(normalizeFileName(fileName));
							}
						}
					}
				}
			}

			return {

				provide: {
					'typescript/languageService': () => languageService,
					'typescript/languageServiceHost': () => languageServiceHost,
					'typescript/documentFileName': uri => ctx.uriToFileName(uri),
					'typescript/documentUri': fileName => ctx.fileNameToUri(fileName),
				},

				dispose() {
					languageService.dispose();
				},

				provideDocumentFormattingEdits(_document, _range, options) {
					formattingOptions = options;
					return undefined;
				},

				provideOnTypeFormattingEdits(_document, _position, _key, options) {
					formattingOptions = options;
					return undefined;
				},

				async provideCompletionItems(document, position, completeContext, token) {

					const uri = URI.parse(document.uri);

					if (!isSemanticDocument(uri, document)) {
						return;
					}

					if (!await isSuggestionsEnabled(document, context)) {
						return;
					}

					if (await isCancellationRequestedWhileSync(token)) {
						return;
					}

					const preferences = await getUserPreferences(ctx, document);
					const fileName = ctx.uriToFileName(uri);
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
							})
						);
					}
				},

				async resolveCompletionItem(item, token) {
					if (await isCancellationRequestedWhileSync(token)) {
						return item;
					}
					const data: CompletionItemData | undefined = item.data;
					if (!data) {
						return item;
					}
					const { fileName, offset } = data;
					const uri = URI.parse(data.uri);
					const document = ctx.getTextDocument(uri)!;
					const [formatOptions, preferences] = await Promise.all([
						getFormatCodeSettings(ctx, document, formattingOptions),
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
						ctx.getTextDocument
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
								details.displayParts
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
						document: TextDocument
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
				},

				async provideRenameRange(document, position, token) {

					const uri = URI.parse(document.uri);

					if (!isSemanticDocument(uri, document)) {
						return;
					}

					if (await isCancellationRequestedWhileSync(token)) {
						return;
					}

					const fileName = ctx.uriToFileName(uri);
					const offset = document.offsetAt(position);
					const renameInfo = safeCall(() => ctx.languageService.getRenameInfo(fileName, offset, renameInfoOptions));
					if (!renameInfo) {
						return;
					}
					if (!renameInfo.canRename) {
						return { message: renameInfo.localizedErrorMessage };
					}
					return convertTextSpan(renameInfo.triggerSpan, document);
				},

				async provideRenameEdits(document, position, newName, token) {

					const uri = URI.parse(document.uri);

					if (!isSemanticDocument(uri, document, true)) {
						return;
					}

					if (await isCancellationRequestedWhileSync(token)) {
						return;
					}

					const fileName = ctx.uriToFileName(uri);
					const offset = document.offsetAt(position);
					const renameInfo = safeCall(() => ctx.languageService.getRenameInfo(fileName, offset, renameInfoOptions));
					if (!renameInfo?.canRename) {
						return;
					}
					if (renameInfo.fileToRename) {
						const [formatOptions, preferences] = await Promise.all([
							getFormatCodeSettings(ctx, document, formattingOptions),
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
						preferences: ts.UserPreferences
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
							oldUri: ctx.fileNameToUri(fileToRename).toString(),
							newUri: ctx.fileNameToUri(newFilePath).toString(),
						});
						return edits;
					}
				},

				async provideCodeActions(document, range, context, token) {

					const uri = URI.parse(document.uri);

					if (!isSemanticDocument(uri, document)) {
						return;
					}

					if (await isCancellationRequestedWhileSync(token)) {
						return;
					}

					return getCodeActions(uri, document, range, context, formattingOptions);
				},

				async resolveCodeAction(codeAction, token) {
					if (await isCancellationRequestedWhileSync(token)) {
						return codeAction;
					}
					return doCodeActionResolve(codeAction, formattingOptions);
				},

				async provideInlayHints(document, range, token) {

					const uri = URI.parse(document.uri);

					if (!isSemanticDocument(uri, document)) {
						return;
					}

					if (await isCancellationRequestedWhileSync(token)) {
						return;
					}

					const preferences = await getUserPreferences(ctx, document);
					const fileName = ctx.uriToFileName(uri);
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
				},

				async provideCallHierarchyItems(document, position, token) {

					const uri = URI.parse(document.uri);

					if (!isSemanticDocument(uri, document)) {
						return;
					}

					if (await isCancellationRequestedWhileSync(token)) {
						return;
					}

					const fileName = ctx.uriToFileName(uri);
					const offset = document.offsetAt(position);
					const calls = safeCall(() => ctx.languageService.prepareCallHierarchy(fileName, offset));
					if (!calls) {
						return [];
					}
					const items = Array.isArray(calls) ? calls : [calls];
					return items.map(item => convertCallHierarchyItem(item, ctx));
				},

				async provideCallHierarchyIncomingCalls(item, token) {
					if (await isCancellationRequestedWhileSync(token)) {
						return [];
					}
					const uri = URI.parse(item.uri);
					const document = ctx.getTextDocument(uri)!;
					const fileName = ctx.uriToFileName(uri);
					const offset = document.offsetAt(item.selectionRange.start);
					const calls = safeCall(() => ctx.languageService.provideCallHierarchyIncomingCalls(fileName, offset));
					if (!calls) {
						return [];
					}
					const items = Array.isArray(calls) ? calls : [calls];
					return items.map(item => convertCallHierarchyIncomingCall(item, ctx));
				},

				async provideCallHierarchyOutgoingCalls(item, token) {
					if (await isCancellationRequestedWhileSync(token)) {
						return [];
					}
					const uri = URI.parse(item.uri);
					const document = ctx.getTextDocument(uri)!;
					const fileName = ctx.uriToFileName(uri);
					const offset = document.offsetAt(item.selectionRange.start);
					const calls = safeCall(() => ctx.languageService.provideCallHierarchyOutgoingCalls(fileName, offset));
					if (!calls) {
						return [];
					}
					const items = Array.isArray(calls) ? calls : [calls];
					return items.map(item => convertCallHierarchyOutgoingCall(item, document, ctx));
				},

				async provideDefinition(document, position, token) {

					const uri = URI.parse(document.uri);

					if (!isSemanticDocument(uri, document)) {
						return;
					}

					if (await isCancellationRequestedWhileSync(token)) {
						return;
					}

					const fileName = ctx.uriToFileName(uri);
					const offset = document.offsetAt(position);
					const info = safeCall(() => ctx.languageService.getDefinitionAndBoundSpan(fileName, offset));
					if (!info) {
						return [];
					}
					return convertDefinitionInfoAndBoundSpan(info, document, ctx);
				},

				async provideTypeDefinition(document, position, token) {

					const uri = URI.parse(document.uri);

					if (!isSemanticDocument(uri, document)) {
						return;
					}

					if (await isCancellationRequestedWhileSync(token)) {
						return;
					}

					const fileName = ctx.uriToFileName(uri);
					const offset = document.offsetAt(position);
					const entries = safeCall(() => ctx.languageService.getTypeDefinitionAtPosition(fileName, offset));
					if (!entries) {
						return [];
					}
					return entries.map(entry => convertDocumentSpantoLocationLink(entry, ctx));
				},

				async provideDiagnostics(document, token) {
					return [
						...await provideDiagnosticsWorker(document, token, 'syntactic') ?? [],
						...await provideDiagnosticsWorker(document, token, 'semantic') ?? [],
					];
				},

				async provideHover(document, position, token) {

					const uri = URI.parse(document.uri);

					if (!isSemanticDocument(uri, document)) {
						return;
					}

					if (await isCancellationRequestedWhileSync(token)) {
						return;
					}

					const fileName = ctx.uriToFileName(uri);
					const offset = document.offsetAt(position);
					const info = safeCall(() => ctx.languageService.getQuickInfoAtPosition(fileName, offset));
					if (!info) {
						return;
					}
					return convertQuickInfo(ts, info, document, ctx.fileNameToUri, ctx.getTextDocument);
				},

				async provideImplementation(document, position, token) {

					const uri = URI.parse(document.uri);

					if (!isSemanticDocument(uri, document)) {
						return;
					}

					if (await isCancellationRequestedWhileSync(token)) {
						return;
					}

					const fileName = ctx.uriToFileName(uri);
					const offset = document.offsetAt(position);
					const entries = safeCall(() => ctx.languageService.getImplementationAtPosition(fileName, offset));
					if (!entries) {
						return [];
					}
					return entries.map(entry => convertDocumentSpantoLocationLink(entry, ctx));
				},

				async provideReferences(document, position, referenceContext, token) {

					const uri = URI.parse(document.uri);

					if (!isSemanticDocument(uri, document, true)) {
						return;
					}

					if (await isCancellationRequestedWhileSync(token)) {
						return;
					}

					const fileName = ctx.uriToFileName(uri);
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
				},

				async provideFileReferences(document, token) {

					const uri = URI.parse(document.uri);

					if (!isSemanticDocument(uri, document, true)) {
						return;
					}

					if (await isCancellationRequestedWhileSync(token)) {
						return;
					}

					const fileName = ctx.uriToFileName(uri);
					const entries = safeCall(() => ctx.languageService.getFileReferences(fileName));
					if (!entries) {
						return [];
					}
					return entries.map(entry => convertDocumentSpanToLocation(entry, ctx));
				},

				async provideDocumentHighlights(document, position, token) {

					const uri = URI.parse(document.uri);

					if (!isSemanticDocument(uri, document)) {
						return;
					}

					if (await isCancellationRequestedWhileSync(token)) {
						return;
					}

					const fileName = ctx.uriToFileName(uri);
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
				},

				async provideDocumentSemanticTokens(document, range, legend, token) {

					const uri = URI.parse(document.uri);

					if (!isSemanticDocument(uri, document)) {
						return;
					}

					if (await isCancellationRequestedWhileSync(token)) {
						return;
					}

					return getDocumentSemanticTokens(uri, document, range, legend);
				},

				async provideWorkspaceSymbols(query, token) {
					if (await isCancellationRequestedWhileSync(token)) {
						return;
					}
					const items = safeCall(() => ctx.languageService.getNavigateToItems(query));
					if (!items) {
						return [];
					}
					return items
						.filter(item => item.containerName || item.kind !== 'alias')
						.map(item => convertNavigateToItem(item, ctx.getTextDocument(ctx.fileNameToUri(item.fileName))!))
						.filter(item => !!item);
				},

				async provideFileRenameEdits(oldUri, newUri, token) {
					if (await isCancellationRequestedWhileSync(token)) {
						return;
					}
					const document = ctx.getTextDocument(oldUri)!;
					const [formatOptions, preferences] = await Promise.all([
						getFormatCodeSettings(ctx, document, formattingOptions),
						getUserPreferences(ctx, document),
					]);

					const fileToRename = ctx.uriToFileName(oldUri);
					const newFilePath = ctx.uriToFileName(newUri);
					const response = safeCall(() => ctx.languageService.getEditsForFileRename(fileToRename, newFilePath, formatOptions, preferences));
					if (!response?.length) {
						return;
					}

					return convertFileTextChanges(response, ctx.fileNameToUri, ctx.getTextDocument);
				},

				async provideSignatureHelp(document, position, context, token) {

					const uri = URI.parse(document.uri);

					if (!isSemanticDocument(uri, document)) {
						return;
					}

					if (await isCancellationRequestedWhileSync(token)) {
						return;
					}

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

					const fileName = ctx.uriToFileName(uri);
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
				},
			};

			async function provideDiagnosticsWorker(document: TextDocument, token: CancellationToken, mode: 'syntactic' | 'semantic') {

				const uri = URI.parse(document.uri);

				if (!isSemanticDocument(uri, document)) {
					return;
				}

				if (!await isValidationEnabled(document, context)) {
					return;
				}

				if (mode === 'semantic' && await isCancellationRequestedWhileSync(token)) {
					return;
				}

				const fileName = ctx.uriToFileName(uri);
				const program = ctx.languageService.getProgram();
				const sourceFile = program?.getSourceFile(fileName);
				if (!program || !sourceFile) {
					return [];
				}
				const tsToken: ts.CancellationToken = {
					isCancellationRequested() {
						return ctx.project.typescript?.languageServiceHost.getCancellationToken?.().isCancellationRequested() ?? false;
					},
					throwIfCancellationRequested() { },
				};
				if (mode === 'syntactic') {
					const syntacticDiagnostics = safeCall(() => program.getSyntacticDiagnostics(sourceFile, tsToken)) ?? [];
					const suggestionDiagnostics = safeCall(() => ctx.languageService.getSuggestionDiagnostics(fileName)) ?? [];

					return [...syntacticDiagnostics, ...suggestionDiagnostics]
						.map(diagnostic => convertDiagnostic(diagnostic, document, ctx.fileNameToUri, ctx.getTextDocument))
						.filter(diagnostic => !!diagnostic);
				}
				else if (mode === 'semantic') {
					const semanticDiagnostics = safeCall(() => program.getSemanticDiagnostics(sourceFile, tsToken)) ?? [];
					const declarationDiagnostics = getEmitDeclarations(program.getCompilerOptions())
						? safeCall(() => program.getDeclarationDiagnostics(sourceFile, tsToken)) ?? []
						: [];

					return [...semanticDiagnostics, ...declarationDiagnostics]
						.map(diagnostic => convertDiagnostic(diagnostic, document, ctx.fileNameToUri, ctx.getTextDocument))
						.filter(diagnostic => !!diagnostic);
				}
			}

			function getEmitDeclarations(compilerOptions: ts.CompilerOptions): boolean {
				return !!(compilerOptions.declaration || compilerOptions.composite);
			}

			function isSemanticDocument(uri: URI, document: TextDocument, withJson = false) {
				const virtualScript = getVirtualScriptByUri(uri);
				if (virtualScript) {
					return true;
				}
				if (withJson && isJsonDocument(document)) {
					return true;
				}
				return isTsDocument(document);
			}

			async function isCancellationRequestedWhileSync(token: CancellationToken) {
				if (sys.sync) {
					let oldSysVersion: number | undefined;
					let newSysVersion = sys.version;
					do {
						oldSysVersion = newSysVersion;
						languageService.getProgram(); // trigger file requests
						newSysVersion = await aggressiveSync(sys.sync);
					} while (newSysVersion !== oldSysVersion && !token.isCancellationRequested);
				}
				return token.isCancellationRequested;
			}

			async function aggressiveSync(fn: () => Promise<number>) {
				const promise = fn();
				let newVersion: number | undefined;
				let syncing = true;
				promise.then(version => {
					newVersion = version;
					syncing = false;
				});
				while (syncing) {
					languageService.getProgram(); // trigger file requests before old requests are completed
					await Promise.race([promise, sleep(10)]);
				}
				return newVersion;
			}

			function sleep(ms: number) {
				return new Promise(resolve => setTimeout(resolve, ms));
			}

			function getVirtualScriptByUri(uri: URI): {
				fileName: string;
				code: VirtualCode;
			} | undefined {
				const decoded = context.decodeEmbeddedDocumentUri(uri);
				const sourceScript = decoded && context.language.scripts.get(decoded[0]);
				const virtualCode = decoded && sourceScript?.generated?.embeddedCodes.get(decoded[1]);
				if (virtualCode && sourceScript?.generated?.languagePlugin.typescript) {
					const { getServiceScript, getExtraServiceScripts } = sourceScript.generated?.languagePlugin.typescript;
					const sourceFileName = uriConverter.asFileName(sourceScript.id);
					if (getServiceScript(sourceScript.generated.root)?.code === virtualCode) {
						return {
							fileName: sourceFileName,
							code: virtualCode,
						};
					}
					for (const extraScript of getExtraServiceScripts?.(sourceFileName, sourceScript.generated.root) ?? []) {
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
