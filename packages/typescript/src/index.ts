import type { LanguageServicePlugin, LanguageServicePluginInstance } from '@volar/language-service';
import * as semver from 'semver';
import type * as ts from 'typescript/lib/tsserverlibrary';
import * as vscode from 'vscode-languageserver-protocol';
import { getConfigTitle, isJsonDocument, isTsDocument } from './shared';
import type { TextDocument } from 'vscode-languageserver-textdocument';

import * as _callHierarchy from './services/callHierarchy';
import * as codeActions from './services/codeAction';
import * as codeActionResolve from './services/codeActionResolve';
import * as completions from './services/completions/basic';
import * as directiveCommentCompletions from './services/completions/directiveComment';
import * as jsDocCompletions from './services/completions/jsDoc';
import * as completionResolve from './services/completions/resolve';
import * as definitions from './services/definition';
import * as diagnostics from './services/diagnostics';
import * as documentHighlight from './services/documentHighlight';
import * as documentSymbol from './services/documentSymbol';
import * as fileReferences from './services/fileReferences';
import * as fileRename from './services/fileRename';
import * as foldingRanges from './services/foldingRanges';
import * as formatting from './services/formatting';
import * as hover from './services/hover';
import * as implementation from './services/implementation';
import * as inlayHints from './services/inlayHints';
import * as prepareRename from './services/prepareRename';
import * as references from './services/references';
import * as rename from './services/rename';
import * as selectionRanges from './services/selectionRanges';
import * as semanticTokens from './services/semanticTokens';
import * as signatureHelp from './services/signatureHelp';
import * as typeDefinitions from './services/typeDefinition';
import * as workspaceSymbols from './services/workspaceSymbol';
import { SharedContext } from './types';

export = (): LanguageServicePlugin => (contextOrNull): LanguageServicePluginInstance => {

	const jsDocTriggerCharacter = '*';
	const directiveCommentTriggerCharacter = '@';
	const triggerCharacters: LanguageServicePluginInstance = {
		triggerCharacters: [
			...getBasicTriggerCharacters('4.3.0'),
			jsDocTriggerCharacter,
			directiveCommentTriggerCharacter,
		],
		signatureHelpTriggerCharacters: ['(', ',', '<'],
		signatureHelpRetriggerCharacters: [')'],
		// https://github.com/microsoft/vscode/blob/ce119308e8fd4cd3f992d42b297588e7abe33a0c/extensions/typescript-language-features/src/languageFeatures/formatting.ts#L99
		autoFormatTriggerCharacters: [';', '}', '\n'],
	};

	if (!contextOrNull) {
		return triggerCharacters;
	}

	const context = contextOrNull;
	if (!context.typescript) {
		console.warn('[@volar-plugins/typescript] context.typescript not found, @volar/typescript plugin disabled. Make sure you have provide tsdk in language client.');
		return {};
	}

	const { module: ts } = context.typescript;
	const basicTriggerCharacters = getBasicTriggerCharacters(ts.version);

	const semanticCtx = {
		...context,
		getTextDocument(uri) {
			for (const [_, map] of context.documents.getMapsByVirtualFileUri(uri)) {
				return map.virtualFileDocument;
			}
			return context.getTextDocument(uri);
		},
	} as SharedContext;
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

	let syntacticHostCtx = {
		fileName: '',
		fileVersion: 0,
		snapshot: ts.ScriptSnapshot.fromString(''),
	};
	const syntacticServiceHost: ts.LanguageServiceHost = {
		getProjectVersion: () => syntacticHostCtx.fileName + '::' + syntacticHostCtx.fileVersion,
		getScriptFileNames: () => [syntacticHostCtx.fileName],
		getScriptVersion: fileName => fileName === syntacticHostCtx.fileName ? syntacticHostCtx.fileVersion.toString() : '',
		getScriptSnapshot: fileName => fileName === syntacticHostCtx.fileName ? syntacticHostCtx.snapshot : undefined,
		getCompilationSettings: () => context.typescript?.languageServiceHost.getCompilationSettings() ?? {},
		getCurrentDirectory: () => '',
		getDefaultLibFileName: () => '',
		readFile: () => undefined,
		fileExists: fileName => fileName === syntacticHostCtx.fileName,
	};
	const syntacticCtx: SharedContext = {
		...semanticCtx,
		typescript: {
			...semanticCtx.typescript,
			languageServiceHost: syntacticServiceHost,
			languageService: ts.createLanguageService(syntacticServiceHost),
		},
	};
	const findDocumentSymbols = documentSymbol.register(syntacticCtx);
	const doFormatting = formatting.register(syntacticCtx);
	const getFoldingRanges = foldingRanges.register(syntacticCtx);

	return {

		...triggerCharacters,
		triggerCharacters: [
			...basicTriggerCharacters,
			jsDocTriggerCharacter,
			directiveCommentTriggerCharacter,
		],

		rules: {
			onFormat(ruleCtx) {
				if (isTsDocument(ruleCtx.document)) {
					prepareSyntacticService(ruleCtx.document);
					const sourceFile = syntacticCtx.typescript.languageService.getProgram()?.getSourceFile(syntacticHostCtx.fileName);
					if (sourceFile) {
						ruleCtx.typescript = {
							sourceFile,
							...syntacticCtx.typescript,
						};
					}
					else {
						console.warn('[@volar-plugins/typescript] sourceFile not found', ruleCtx.document.uri);
					}
				}
				return ruleCtx;
			},
			onSyntax(ruleCtx) {
				if (isTsDocument(ruleCtx.document)) {
					prepareSyntacticService(ruleCtx.document);
					const sourceFile = syntacticCtx.typescript.languageService.getProgram()?.getSourceFile(syntacticHostCtx.fileName);
					if (sourceFile) {
						ruleCtx.typescript = {
							sourceFile,
							...syntacticCtx.typescript,
						};
					}
					else {
						console.warn('[@volar-plugins/typescript] sourceFile not found', ruleCtx.document.uri);
					}
				}
				return ruleCtx;
			},
			onSemantic(ruleCtx) {
				if (isTsDocument(ruleCtx.document)) {
					const sourceFile = semanticCtx.typescript.languageService.getProgram()?.getSourceFile(context.uriToFileName(ruleCtx.document.uri));
					if (sourceFile) {
						ruleCtx.typescript = {
							sourceFile,
							...semanticCtx.typescript,
						};
					}
					else {
						console.warn('[@volar-plugins/typescript] sourceFile not found', ruleCtx.document.uri);
					}
				}
				return ruleCtx;
			},
		},

		doAutoInsert(document, position, ctx) {
			if (
				(document.languageId === 'javascriptreact' || document.languageId === 'typescriptreact')
				&& ctx.lastChange.text.endsWith('>')
			) {
				const configName = document.languageId === 'javascriptreact' ? 'javascript.autoClosingTags' : 'typescript.autoClosingTags';
				const config = context.configurationHost?.getConfiguration<boolean>(configName) ?? true;
				if (config) {

					prepareSyntacticService(document);

					const close = syntacticCtx.typescript.languageService.getJsxClosingTagAtPosition(context.uriToFileName(document.uri), document.offsetAt(position));

					if (close) {
						return '$0' + close.newText;
					}
				}
			}
		},

		complete: {

			async on(document, position, context) {
				if (isTsDocument(document)) {

					let result: vscode.CompletionList = {
						isIncomplete: false,
						items: [],
					};

					if (!context || context.triggerKind !== vscode.CompletionTriggerKind.TriggerCharacter || (context.triggerCharacter && basicTriggerCharacters.includes(context.triggerCharacter))) {

						const completeOptions: ts.GetCompletionsAtPositionOptions = {
							triggerCharacter: context?.triggerCharacter as ts.CompletionsTriggerCharacter,
							triggerKind: context?.triggerKind,
						};
						const basicResult = await doComplete(document.uri, position, completeOptions);

						if (basicResult) {
							result = basicResult;
						}
					}
					if (!context || context.triggerKind !== vscode.CompletionTriggerKind.TriggerCharacter || context.triggerCharacter === jsDocTriggerCharacter) {

						const jsdocResult = await doJsDocComplete(document.uri, position);

						if (jsdocResult) {
							result.items.push(jsdocResult);
						}
					}
					if (!context || context.triggerKind !== vscode.CompletionTriggerKind.TriggerCharacter || context.triggerCharacter === directiveCommentTriggerCharacter) {

						const directiveCommentResult = await doDirectiveCommentComplete(document.uri, position);

						if (directiveCommentResult) {
							result.items = result.items.concat(directiveCommentResult);
						}
					}

					return result;
				}
			},

			resolve(item) {
				return doCompletionResolve(item);
			},
		},

		rename: {

			prepare(document, position) {
				if (isTsDocument(document)) {
					return doPrepareRename(document.uri, position);
				}
			},

			on(document, position, newName) {
				if (isTsDocument(document) || isJsonDocument(document)) {
					return doRename(document.uri, position, newName);
				}
			},
		},

		codeAction: {

			on(document, range, context) {
				if (isTsDocument(document)) {
					return getCodeActions(document.uri, range, context);
				}
			},

			resolve(codeAction) {
				return doCodeActionResolve(codeAction);
			},
		},

		inlayHints: {

			on(document, range) {
				if (isTsDocument(document)) {
					return getInlayHints(document.uri, range);
				}
			},
		},

		callHierarchy: {

			prepare(document, position) {
				if (isTsDocument(document)) {
					return callHierarchy.doPrepare(document.uri, position);
				}
			},

			onIncomingCalls(item) {
				return callHierarchy.getIncomingCalls(item);
			},

			onOutgoingCalls(item) {
				return callHierarchy.getOutgoingCalls(item);
			},
		},

		definition: {

			on(document, position) {
				if (isTsDocument(document)) {
					return findDefinition(document.uri, position);
				}
			},

			onType(document, position) {
				if (isTsDocument(document)) {
					return findTypeDefinition(document.uri, position);
				}
			},
		},

		validation: {
			onSemantic(document) {
				if (isTsDocument(document)) {
					return doValidation(document.uri, { semantic: true });
				}
			},
			onDeclaration(document) {
				if (isTsDocument(document)) {
					return doValidation(document.uri, { declaration: true });
				}
			},
			onSuggestion(document) {
				if (isTsDocument(document)) {
					return doValidation(document.uri, { suggestion: true });
				}
			},
			onSyntactic(document) {
				if (isTsDocument(document)) {
					return doValidation(document.uri, { syntactic: true });
				}
			},
		},

		doHover(document, position) {
			if (isTsDocument(document)) {
				return doHover(document.uri, position);
			}
		},

		findImplementations(document, position) {
			if (isTsDocument(document)) {
				return findImplementations(document.uri, position);
			}
		},

		findReferences(document, position) {
			if (isTsDocument(document) || isJsonDocument(document)) {
				return findReferences(document.uri, position);
			}
		},

		findFileReferences(document) {
			if (isTsDocument(document) || isJsonDocument(document)) {
				return findFileReferences(document.uri);
			}
		},

		findDocumentHighlights(document, position) {
			if (isTsDocument(document)) {
				return findDocumentHighlights(document.uri, position);
			}
		},

		findDocumentSymbols(document) {
			if (isTsDocument(document)) {

				prepareSyntacticService(document);

				return findDocumentSymbols(document.uri);
			}
		},

		findDocumentSemanticTokens(document, range, legend) {
			if (isTsDocument(document)) {
				return getDocumentSemanticTokens(document.uri, range, legend);
			}
		},

		findWorkspaceSymbols(query) {
			return findWorkspaceSymbols(query);
		},

		doFileRename(oldUri, newUri) {
			return getEditsForFileRename(oldUri, newUri);
		},

		getFoldingRanges(document) {
			if (isTsDocument(document)) {

				prepareSyntacticService(document);

				return getFoldingRanges(document.uri);
			}
		},

		getSelectionRanges(document, positions) {
			if (isTsDocument(document)) {
				return getSelectionRanges(document.uri, positions);
			}
		},

		getSignatureHelp(document, position, context) {
			if (isTsDocument(document)) {
				return getSignatureHelp(document.uri, position, context);
			}
		},

		async format(document, range, options_2) {
			if (isTsDocument(document)) {

				const enable = await context.configurationHost?.getConfiguration<boolean>(getConfigTitle(document) + '.format.enable');
				if (enable === false) {
					return;
				}

				prepareSyntacticService(document);

				return doFormatting.onRange(document.uri, range, options_2);
			}
		},

		async formatOnType(document, position, key, options_2) {
			if (isTsDocument(document)) {

				const enable = await context.configurationHost?.getConfiguration<boolean>(getConfigTitle(document) + '.format.enable');
				if (enable === false) {
					return;
				}

				prepareSyntacticService(document);

				return doFormatting.onType(document.uri, options_2, position, key);
			}
		},

		getIndentSensitiveLines(document) {
			if (isTsDocument(document)) {

				prepareSyntacticService(document);

				const sourceFile = syntacticCtx.typescript.languageService.getProgram()?.getSourceFile(context.uriToFileName(document.uri));

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
			}
		},
	};

	function prepareSyntacticService(document: TextDocument) {
		syntacticHostCtx.fileName = context.uriToFileName(document.uri);
		syntacticHostCtx.fileVersion = document.version;
		if (context.documents.hasVirtualFileByUri(document.uri)) {
			const snapshot = context.documents.getVirtualFileByUri(document.uri)[0]?.snapshot;
			if (snapshot) {
				syntacticHostCtx.snapshot = snapshot;
			}
			else {
				throw new Error('No snapshot found for ' + document.uri);
			}
		}
		else {
			const snapshot = context.host.getScriptSnapshot(syntacticHostCtx.fileName);
			if (snapshot) {
				syntacticHostCtx.snapshot = snapshot;
			}
			else {
				throw new Error('No snapshot found for ' + document.uri);
			}
		}
	}
};

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
