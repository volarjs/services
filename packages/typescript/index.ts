import type { CancellationToken, CompletionList, CompletionTriggerKind, FileChangeType, ServicePluginInstance, ServicePlugin } from '@volar/language-service';
import * as semver from 'semver';
import type * as ts from 'typescript';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { getConfigTitle, isJsonDocument, isTsDocument } from './lib/shared';
import { URI } from 'vscode-uri';

import { getDocumentRegistry } from '@volar/typescript';
import * as tsFaster from 'typescript-auto-import-cache';
import * as _callHierarchy from './lib/features/callHierarchy';
import * as codeActions from './lib/features/codeAction';
import * as codeActionResolve from './lib/features/codeActionResolve';
import * as completions from './lib/features/completions/basic';
import * as directiveCommentCompletions from './lib/features/completions/directiveComment';
import * as jsDocCompletions from './lib/features/completions/jsDoc';
import * as completionResolve from './lib/features/completions/resolve';
import * as definitions from './lib/features/definition';
import * as diagnostics from './lib/features/diagnostics';
import * as documentHighlight from './lib/features/documentHighlight';
import * as documentSymbol from './lib/features/documentSymbol';
import * as fileReferences from './lib/features/fileReferences';
import * as fileRename from './lib/features/fileRename';
import * as foldingRanges from './lib/features/foldingRanges';
import * as formatting from './lib/features/formatting';
import * as hover from './lib/features/hover';
import * as implementation from './lib/features/implementation';
import * as inlayHints from './lib/features/inlayHints';
import * as prepareRename from './lib/features/prepareRename';
import * as references from './lib/features/references';
import * as rename from './lib/features/rename';
import * as selectionRanges from './lib/features/selectionRanges';
import * as semanticTokens from './lib/features/semanticTokens';
import * as signatureHelp from './lib/features/signatureHelp';
import * as typeDefinitions from './lib/features/typeDefinition';
import * as workspaceSymbols from './lib/features/workspaceSymbol';
import type { SharedContext } from './lib/types';

export * from '@volar/typescript';

export interface Provide {
	'typescript/typescript': () => typeof import('typescript');
	'typescript/languageService': () => ts.LanguageService;
	'typescript/languageServiceHost': () => ts.LanguageServiceHost;
	'typescript/syntacticLanguageService': () => ts.LanguageService;
	'typescript/syntacticLanguageServiceHost': () => ts.LanguageServiceHost;
};

export function create(ts: typeof import('typescript')): ServicePlugin {
	const basicTriggerCharacters = getBasicTriggerCharacters(ts.version);
	const jsDocTriggerCharacter = '*';
	const directiveCommentTriggerCharacter = '@';
	return {
		name: 'typescript',
		triggerCharacters: [
			...basicTriggerCharacters,
			jsDocTriggerCharacter,
			directiveCommentTriggerCharacter,
		],
		signatureHelpTriggerCharacters: ['(', ',', '<'],
		signatureHelpRetriggerCharacters: [')'],
		// https://github.com/microsoft/vscode/blob/ce119308e8fd4cd3f992d42b297588e7abe33a0c/extensions/typescript-language-features/src/languageFeatures/formatting.ts#L99
		autoFormatTriggerCharacters: [';', '}', '\n'],
		create(context): ServicePluginInstance<Provide> {

			const syntacticServiceHost: ts.LanguageServiceHost = {
				getProjectVersion: () => syntacticHostCtx.projectVersion.toString(),
				getScriptFileNames: () => [syntacticHostCtx.fileName],
				getScriptVersion: fileName => fileName === syntacticHostCtx.fileName ? syntacticHostCtx.fileVersion.toString() : '',
				getScriptSnapshot: fileName => fileName === syntacticHostCtx.fileName ? syntacticHostCtx.snapshot : undefined,
				getCompilationSettings: () => ({}),
				getCurrentDirectory: () => '/',
				getDefaultLibFileName: () => '',
				readFile: () => undefined,
				fileExists: fileName => fileName === syntacticHostCtx.fileName,
			};
			const syntacticCtx: SharedContext = {
				...context,
				languageServiceHost: syntacticServiceHost,
				languageService: ts.createLanguageService(syntacticServiceHost, undefined, 2 satisfies ts.LanguageServiceMode.Syntactic),
				ts,
				uriToFileName: uri => {
					if (uri !== syntacticHostCtx.document?.uri) {
						throw new Error(`uriToFileName: uri not found: ${uri}`);
					}
					return syntacticHostCtx.fileName;
				},
				fileNameToUri: fileName => {
					if (fileName !== syntacticHostCtx.fileName) {
						throw new Error(`fileNameToUri: fileName not found: ${fileName}`);
					}
					return syntacticHostCtx.document!.uri;
				},
				getTextDocument(uri) {
					if (uri !== syntacticHostCtx.document?.uri) {
						throw new Error(`getTextDocument: uri not found: ${uri}`);
					}
					return syntacticHostCtx.document;
				},
			};
			const findDocumentSymbols = documentSymbol.register(syntacticCtx);
			const doFormatting = formatting.register(syntacticCtx);
			const getFoldingRanges = foldingRanges.register(syntacticCtx);
			const syntacticService: ServicePluginInstance<Provide> = {

				provide: {
					'typescript/typescript': () => ts,
					'typescript/languageService': () => syntacticCtx.languageService,
					'typescript/languageServiceHost': () => syntacticCtx.languageServiceHost,
					'typescript/syntacticLanguageService': () => syntacticCtx.languageService,
					'typescript/syntacticLanguageServiceHost': () => syntacticCtx.languageServiceHost,
				},

				provideAutoInsertionEdit(document, position, lastChange) {
					if (
						(document.languageId === 'javascriptreact' || document.languageId === 'typescriptreact')
						&& lastChange.text.endsWith('>')
					) {
						const config = context.env.getConfiguration?.<boolean>(getConfigTitle(document) + '.autoClosingTags') ?? true;
						if (config) {

							const ctx = prepareSyntacticService(document);
							const close = syntacticCtx.languageService.getJsxClosingTagAtPosition(ctx.fileName, document.offsetAt(position));

							if (close) {
								return '$0' + close.newText;
							}
						}
					}
				},

				provideFoldingRanges(document) {

					if (!isTsDocument(document))
						return;

					prepareSyntacticService(document);

					return getFoldingRanges(document.uri);
				},

				provideDocumentSymbols(document) {

					if (!isTsDocument(document))
						return;

					prepareSyntacticService(document);

					return findDocumentSymbols(document.uri);
				},

				async provideDocumentFormattingEdits(document, range, options_2) {

					if (!isTsDocument(document))
						return;

					const enable = await context.env.getConfiguration?.<boolean>(getConfigTitle(document) + '.format.enable') ?? true;
					if (!enable) {
						return;
					}

					prepareSyntacticService(document);

					return await doFormatting.onRange(document, range, options_2);
				},

				async provideOnTypeFormattingEdits(document, position, key, options_2) {

					if (!isTsDocument(document))
						return;

					const enable = await context.env.getConfiguration?.<boolean>(getConfigTitle(document) + '.format.enable') ?? true;
					if (!enable) {
						return;
					}

					prepareSyntacticService(document);

					return doFormatting.onType(document, options_2, position, key);
				},

				provideFormattingIndentSensitiveLines(document) {

					if (!isTsDocument(document))
						return;

					const ctx = prepareSyntacticService(document);
					const sourceFile = ts.createSourceFile(ctx.fileName, document.getText(), ts.ScriptTarget.ESNext);

					if (sourceFile) {

						const lines: number[] = [];

						sourceFile.forEachChild(function walk(node) {
							if (
								node.kind === ts.SyntaxKind.FirstTemplateToken
								|| node.kind === ts.SyntaxKind.LastTemplateToken
								|| node.kind === ts.SyntaxKind.TemplateHead
							) {
								const startLine = document.positionAt(node.getStart(sourceFile)).line;
								const endLine = document.positionAt(node.getEnd()).line;
								for (let i = startLine + 1; i <= endLine; i++) {
									lines.push(i);
								}
							}
							node.forEachChild(walk);
						});

						return lines;
					}
				},
			};

			let syntacticHostCtx = {
				projectVersion: 0,
				document: undefined as TextDocument | undefined,
				fileName: '',
				fileVersion: 0,
				snapshot: ts.ScriptSnapshot.fromString(''),
			};

			if (!context.language.typescript) {
				return syntacticService;
			}

			const { sys, languageServiceHost } = context.language.typescript;
			const created = tsFaster.createLanguageService(
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

			const semanticCtx: SharedContext = {
				...context,
				languageServiceHost,
				languageService,
				ts,
				uriToFileName: uri => {
					const [_virtualCode, file] = context.documents.getVirtualCodeByUri(uri);
					if (file) {
						return context.env.typescript!.uriToFileName(file.id);
					}
					else {
						return context.env.typescript!.uriToFileName(uri);
					}
				},
				fileNameToUri: fileName => {
					const uri = context.env.typescript!.fileNameToUri(fileName);
					const file = context.language.files.get(uri);
					if (file?.generated) {
						const script = file.generated.languagePlugin.typescript?.getScript(file.generated.code);
						if (script) {
							return context.documents.getVirtualCodeUri(uri, script.code.id);
						}
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
				},
			};
			const findDefinition = definitions.register(semanticCtx);
			const findTypeDefinition = typeDefinitions.register(semanticCtx);
			const findReferences = references.register(semanticCtx);
			const findFileReferences = fileReferences.register(semanticCtx);
			const findImplementations = implementation.register(semanticCtx);
			const doPrepareRename = prepareRename.register(semanticCtx);
			const doRename = rename.register(semanticCtx);
			const getEditsForFileRename = fileRename.register(semanticCtx);
			const getCodeActions = codeActions.register(semanticCtx);
			const doCodeActionResolve = codeActionResolve.register(semanticCtx);
			const getInlayHints = inlayHints.register(semanticCtx);
			const findDocumentHighlights = documentHighlight.register(semanticCtx);
			const findWorkspaceSymbols = workspaceSymbols.register(semanticCtx);
			const doComplete = completions.register(semanticCtx);
			const doCompletionResolve = completionResolve.register(semanticCtx);
			const doDirectiveCommentComplete = directiveCommentCompletions.register(semanticCtx);
			const doJsDocComplete = jsDocCompletions.register(semanticCtx);
			const doHover = hover.register(semanticCtx);
			const getSignatureHelp = signatureHelp.register(semanticCtx);
			const getSelectionRanges = selectionRanges.register(semanticCtx);
			const doValidation = diagnostics.register(semanticCtx);
			const getDocumentSemanticTokens = semanticTokens.register(semanticCtx);
			const callHierarchy = _callHierarchy.register(semanticCtx);

			return {

				...syntacticService,

				provide: {
					...syntacticService.provide!,
					'typescript/languageService': () => languageService,
					'typescript/languageServiceHost': () => languageServiceHost,
				},

				dispose() {
					languageService.dispose();
				},

				async provideCompletionItems(document, position, completeContext, token) {

					if (!isTsDocument(document))
						return;

					const enable = await context.env.getConfiguration?.<boolean>(getConfigTitle(document) + '.suggest.enabled') ?? true;
					if (!enable) {
						return;
					}

					return await worker(token, async () => {

						let result: CompletionList = {
							isIncomplete: false,
							items: [],
						};

						if (!completeContext || completeContext.triggerKind !== 2 satisfies typeof CompletionTriggerKind.TriggerCharacter || (completeContext.triggerCharacter && basicTriggerCharacters.includes(completeContext.triggerCharacter))) {

							const completeOptions: ts.GetCompletionsAtPositionOptions = {
								triggerCharacter: completeContext.triggerCharacter as ts.CompletionsTriggerCharacter,
								triggerKind: completeContext.triggerKind,
							};
							const basicResult = await doComplete(document.uri, position, completeOptions);

							if (basicResult) {
								result = basicResult;
							}
						}
						if (!completeContext || completeContext.triggerKind !== 2 satisfies typeof CompletionTriggerKind.TriggerCharacter || completeContext.triggerCharacter === jsDocTriggerCharacter) {

							const jsdocResult = await doJsDocComplete(document.uri, position);

							if (jsdocResult) {
								result.items.push(jsdocResult);
							}
						}
						if (!completeContext || completeContext.triggerKind !== 2 satisfies typeof CompletionTriggerKind.TriggerCharacter || completeContext.triggerCharacter === directiveCommentTriggerCharacter) {

							const directiveCommentResult = await doDirectiveCommentComplete(document.uri, position);

							if (directiveCommentResult) {
								result.items = result.items.concat(directiveCommentResult);
							}
						}

						return result;
					});
				},

				resolveCompletionItem(item, token) {
					return worker(token, () => {
						return doCompletionResolve(item);
					});
				},

				provideRenameRange(document, position, token) {

					if (!isTsDocument(document))
						return;

					return worker(token, () => {
						return doPrepareRename(document.uri, position);
					});
				},

				provideRenameEdits(document, position, newName, token) {

					if (!isTsDocument(document) && !isJsonDocument(document))
						return;

					return worker(token, () => {
						return doRename(document.uri, position, newName);
					});
				},

				provideCodeActions(document, range, context, token) {

					if (!isTsDocument(document))
						return;

					return worker(token, () => {
						return getCodeActions(document.uri, range, context);
					});
				},

				resolveCodeAction(codeAction, token) {
					return worker(token, () => {
						return doCodeActionResolve(codeAction);
					});
				},

				provideInlayHints(document, range, token) {

					if (!isTsDocument(document))
						return;

					return worker(token, () => {
						return getInlayHints(document.uri, range);
					});
				},

				provideCallHierarchyItems(document, position, token) {

					if (!isTsDocument(document))
						return;

					return worker(token, () => {
						return callHierarchy.doPrepare(document.uri, position);
					});
				},

				provideCallHierarchyIncomingCalls(item, token) {
					return worker(token, () => {
						return callHierarchy.getIncomingCalls(item);
					});
				},

				provideCallHierarchyOutgoingCalls(item, token) {
					return worker(token, () => {
						return callHierarchy.getOutgoingCalls(item);
					});
				},

				provideDefinition(document, position, token) {

					if (!isTsDocument(document))
						return;

					return worker(token, () => {
						return findDefinition(document.uri, position);
					});
				},

				provideTypeDefinition(document, position, token) {

					if (!isTsDocument(document))
						return;

					return worker(token, () => {
						return findTypeDefinition(document.uri, position);
					});
				},

				async provideDiagnostics(document, token) {

					if (!isTsDocument(document))
						return;

					const enable = await context.env.getConfiguration?.<boolean>(getConfigTitle(document) + '.validate.enable') ?? true;
					if (!enable) {
						return;
					}

					return await worker(token, () => {
						return doValidation(document.uri, { syntactic: true, suggestion: true });
					});
				},

				provideSemanticDiagnostics(document, token) {

					if (!isTsDocument(document))
						return;

					return worker(token, () => {
						return doValidation(document.uri, { semantic: true, declaration: true });
					});
				},

				provideHover(document, position, token) {

					if (!isTsDocument(document))
						return;

					return worker(token, () => {
						return doHover(document.uri, position);
					});
				},

				provideImplementation(document, position, token) {

					if (!isTsDocument(document))
						return;

					return worker(token, () => {
						return findImplementations(document.uri, position);
					});
				},

				provideReferences(document, position, referenceContext, token) {

					if (!isTsDocument(document) && !isJsonDocument(document))
						return;

					return worker(token, () => {
						return findReferences(document.uri, position, referenceContext);
					});
				},

				provideFileReferences(document, token) {

					if (!isTsDocument(document) && !isJsonDocument(document))
						return;

					return worker(token, () => {
						return findFileReferences(document.uri);
					});
				},

				provideDocumentHighlights(document, position, token) {

					if (!isTsDocument(document))
						return;

					return worker(token, () => {
						return findDocumentHighlights(document.uri, position);
					});
				},

				provideDocumentSemanticTokens(document, range, legend, token) {

					if (!isTsDocument(document))
						return;

					return worker(token, () => {
						return getDocumentSemanticTokens(document.uri, range, legend);
					});
				},

				provideWorkspaceSymbols(query, token) {
					return worker(token, () => {
						return findWorkspaceSymbols(query);
					});
				},

				provideFileRenameEdits(oldUri, newUri, token) {
					return worker(token, () => {
						return getEditsForFileRename(oldUri, newUri);
					});
				},

				provideSelectionRanges(document, positions, token) {

					if (!isTsDocument(document))
						return;

					return worker(token, () => {
						return getSelectionRanges(document.uri, positions);
					});
				},

				provideSignatureHelp(document, position, context, token) {

					if (!isTsDocument(document))
						return;

					return worker(token, () => {
						return getSignatureHelp(document.uri, position, context);
					});
				},
			};

			async function worker<T>(token: CancellationToken, callback: () => T): Promise<Awaited<T>> {

				let oldSysVersion = await sys.sync?.();
				let result = await callback();
				let newSysVersion = await sys.sync?.();

				while (newSysVersion !== oldSysVersion && !token.isCancellationRequested) {
					oldSysVersion = newSysVersion;
					result = await callback();
					newSysVersion = await sys.sync?.();
				}

				return result;
			}

			function prepareSyntacticService(document: TextDocument) {
				if (syntacticHostCtx.document !== document || syntacticHostCtx.fileVersion !== document.version) {
					syntacticHostCtx.document = document;
					syntacticHostCtx.fileName = URI.parse(document.uri).fsPath.replace(/\\/g, '/');
					syntacticHostCtx.fileVersion = document.version;
					syntacticHostCtx.snapshot = ts.ScriptSnapshot.fromString(document.getText());
					syntacticHostCtx.projectVersion++;
				}
				return syntacticHostCtx;
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
