import type { LanguageServicePlugin } from '@volar/language-service';
import * as semver from 'semver';
import type * as ts from 'typescript/lib/tsserverlibrary';
import * as vscode from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getConfigTitle, isJsonDocument, isTsDocument } from './shared';

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

const jsDocTriggerCharacters = ['*'];
const directiveCommentTriggerCharacters = ['@'];

export = (): LanguageServicePlugin => (context) => {

	if (!context.typescript) {
		console.warn('[@volar-plugins/typescript] context.typescript not found, @volar/typescript plugin disabled. Make sure you have provide tsdk in language client.');
		return {};
	}

	const basicTriggerCharacters = getBasicTriggerCharacters('4.3.0');
	const typescript = context.typescript;
	const documents = new Map<string, [string, TextDocument]>();
	const findDefinition = definitions.register(typescript.languageService, getTextDocument, context);
	const findTypeDefinition = typeDefinitions.register(typescript.languageService, getTextDocument, context);
	const findReferences = references.register(typescript.languageService, getTextDocument, context);
	const findFileReferences = fileReferences.register(typescript.languageService, getTextDocument, context);
	const findImplementations = implementation.register(typescript.languageService, getTextDocument, context);
	const doPrepareRename = prepareRename.register(typescript.languageService, getTextDocument, context);
	const doRename = rename.register(typescript.languageService, getTextDocument, context);
	const getEditsForFileRename = fileRename.register(typescript.languageService, getTextDocument, context);
	const getCodeActions = codeActions.register(typescript.languageService, getTextDocument, context);
	const doCodeActionResolve = codeActionResolve.register(typescript.languageService, getTextDocument, context);
	const getInlayHints = inlayHints.register(typescript.languageService, getTextDocument, context);
	const findDocumentHighlights = documentHighlight.register(typescript.languageService, getTextDocument, context);
	const findDocumentSymbols = documentSymbol.register(typescript.languageService, getTextDocument, context);
	const findWorkspaceSymbols = workspaceSymbols.register(typescript.languageService, getTextDocument, context);
	const doComplete = completions.register(typescript.languageService, getTextDocument, context);
	const doCompletionResolve = completionResolve.register(typescript.languageService, getTextDocument, context);
	const doDirectiveCommentComplete = directiveCommentCompletions.register(getTextDocument);
	const doJsDocComplete = jsDocCompletions.register(typescript.languageService, getTextDocument, context);
	const doHover = hover.register(typescript.languageService, getTextDocument, context);
	const doFormatting = formatting.register(typescript.languageService, getTextDocument, context);
	const getSignatureHelp = signatureHelp.register(typescript.languageService, getTextDocument, context);
	const getSelectionRanges = selectionRanges.register(typescript.languageService, getTextDocument, context);
	const doValidation = diagnostics.register(typescript.languageService, getTextDocument, context);
	const getFoldingRanges = foldingRanges.register(typescript.languageService, getTextDocument, context);
	const getDocumentSemanticTokens = semanticTokens.register(typescript.languageService, getTextDocument, context);
	const callHierarchy = _callHierarchy.register(typescript.languageService, getTextDocument, context);

	return {

		rules: {
			prepare(ruleCtx) {
				if (isTsDocument(ruleCtx.document)) {
					ruleCtx.typescript = {
						sourceFile: typescript.languageService.getProgram()?.getSourceFile(context.uriToFileName(ruleCtx.document.uri))!,
						getTextDocument,
						...typescript,
					};
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
				const config = context.env.configurationHost?.getConfiguration<boolean>(configName) ?? true;
				if (config) {
					const tsLs = typescript.languageService;
					const close = tsLs.getJsxClosingTagAtPosition(context.uriToFileName(document.uri), document.offsetAt(position));
					if (close) {
						return '$0' + close.newText;
					}
				}
			}
		},

		complete: {

			triggerCharacters: [
				...basicTriggerCharacters,
				...jsDocTriggerCharacters,
				...directiveCommentTriggerCharacters,
			],

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
					if (!context || context.triggerKind !== vscode.CompletionTriggerKind.TriggerCharacter || (context.triggerCharacter && jsDocTriggerCharacters.includes(context.triggerCharacter))) {

						const jsdocResult = await doJsDocComplete(document.uri, position);

						if (jsdocResult) {
							result.items.push(jsdocResult);
						}
					}
					if (!context || context.triggerKind !== vscode.CompletionTriggerKind.TriggerCharacter || (context.triggerCharacter && directiveCommentTriggerCharacters.includes(context.triggerCharacter))) {

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

				const enable = await context.env.configurationHost?.getConfiguration<boolean>(getConfigTitle(document) + '.format.enable');
				if (enable === false) {
					return;
				}

				return doFormatting.onRange(document.uri, range, options_2, {
					baseIndentSize: options_2.initialIndent ? options_2.tabSize : 0,
				});
			}
		},

		async formatOnType(document, position, key, options_2) {
			if (isTsDocument(document)) {

				const enable = await context.env.configurationHost?.getConfiguration<boolean>(getConfigTitle(document) + '.format.enable');
				if (enable === false) {
					return;
				}

				return doFormatting.onType(document.uri, options_2, position, key);
			}
		},
	};

	function getTextDocument(uri: string) {
		const fileName = context.uriToFileName(uri);
		const version = typescript.languageServiceHost.getScriptVersion(fileName);
		const oldDoc = documents.get(uri);
		if (!oldDoc || oldDoc[0] !== version) {
			const scriptSnapshot = typescript.languageServiceHost.getScriptSnapshot(fileName);
			if (scriptSnapshot) {
				const scriptText = scriptSnapshot.getText(0, scriptSnapshot.getLength());
				const document = TextDocument.create(uri, 'txt' /* not important */, oldDoc ? oldDoc[1].version + 1 : 0, scriptText);
				documents.set(uri, [version, document]);
			}
		}
		return documents.get(uri)?.[1];
	}
};
