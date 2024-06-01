import type * as vscode from '@volar/language-service';
import type * as ts from 'typescript';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { URI } from 'vscode-uri';
import { getFormatCodeSettings } from '../configs/getFormatCodeSettings';
import { getUserPreferences } from '../configs/getUserPreferences';
import { safeCall } from '../shared';
import * as fixNames from '../utils/fixNames';
import { convertFileTextChanges } from '../utils/lspConverters';
import { resolveFixAllCodeAction, resolveOrganizeImportsCodeAction, resolveRefactorCodeAction } from './codeActionResolve';
import type { SharedContext } from './types';

export interface FixAllData {
	type: 'fixAll';
	uri: string;
	fileName: string;
	fixIds: {}[];
}

export interface RefactorData {
	type: 'refactor';
	uri: string;
	fileName: string;
	refactorName: string;
	actionName: string;
	range: { pos: number, end: number; };
}

export interface OrganizeImportsData {
	type: 'organizeImports';
	uri: string;
	fileName: string;
}

export type Data = FixAllData | RefactorData | OrganizeImportsData;

const renameCommandRefactors = new Set([
	'refactor.rewrite.property.generateAccessors',
	'refactor.extract.type',
	'refactor.extract.interface',
	'refactor.extract.typedef',
	'refactor.extract.constant',
	'refactor.extract.function',
]);

export function register(ctx: SharedContext) {

	let resolveCommandSupport = ctx.env.clientCapabilities?.textDocument?.codeAction?.resolveSupport?.properties?.includes('command');
	let resolveEditSupport = ctx.env.clientCapabilities?.textDocument?.codeAction?.resolveSupport?.properties?.includes('edit');
	let loged = false;

	const wranUnsupportResolve = () => {
		if (loged) {
			return;
		}
		loged = true;
		console.warn('[volar-service-typescript] The language client lacks support for the command/edit properties in the resolve code action. Therefore, the code action resolve is pre-calculated.');
	};

	if (!ctx.env.clientCapabilities) {
		resolveCommandSupport = true;
		resolveEditSupport = true;
	}

	return async (uri: URI, document: TextDocument, range: vscode.Range, context: vscode.CodeActionContext, formattingOptions: vscode.FormattingOptions | undefined) => {
		const [formatOptions, preferences] = await Promise.all([
			getFormatCodeSettings(ctx, document, formattingOptions),
			getUserPreferences(ctx, document),
		]);

		const fileName = ctx.uriToFileName(uri);
		const start = document.offsetAt(range.start);
		const end = document.offsetAt(range.end);
		let result: vscode.CodeAction[] = [];

		const onlyQuickFix = matchOnlyKind(`${'quickfix' satisfies typeof vscode.CodeActionKind.QuickFix}.ts`);
		if (!context.only || onlyQuickFix) {
			for (const error of context.diagnostics) {
				const codeFixes = safeCall(() => ctx.languageService.getCodeFixesAtPosition(
					fileName,
					document.offsetAt(error.range.start),
					document.offsetAt(error.range.end),
					[Number(error.code)],
					formatOptions,
					preferences
				)) ?? [];
				for (const codeFix of codeFixes) {
					result = result.concat(convertCodeFixAction(codeFix, [error], onlyQuickFix ?? '' satisfies typeof vscode.CodeActionKind.Empty));
				}
			}
		}

		if (context.only) {
			for (const only of context.only) {
				if (only.split('.')[0] === 'refactor' satisfies typeof vscode.CodeActionKind.Refactor) {
					const refactors = safeCall(() => ctx.languageService.getApplicableRefactors(
						fileName,
						{ pos: start, end: end },
						preferences,
						undefined,
						only
					)) ?? [];
					for (const refactor of refactors) {
						result = result.concat(convertApplicableRefactorInfo(refactor));
					}
				}
			}
		}
		else {
			const refactors = safeCall(() => ctx.languageService.getApplicableRefactors(
				fileName,
				{ pos: start, end: end },
				preferences,
				undefined,
				undefined
			)) ?? [];
			for (const refactor of refactors) {
				result = result.concat(convertApplicableRefactorInfo(refactor));
			}
		}

		const onlySourceOrganizeImports = matchOnlyKind(`${'source.organizeImports' satisfies typeof vscode.CodeActionKind.SourceOrganizeImports}.ts`);
		if (onlySourceOrganizeImports) {
			const action: vscode.CodeAction = {
				title: 'Organize Imports',
				kind: onlySourceOrganizeImports,
			};
			const data: OrganizeImportsData = {
				type: 'organizeImports',
				uri: document.uri,
				fileName,
			};
			if (resolveEditSupport) {
				action.data = data;
			}
			else {
				wranUnsupportResolve();
				resolveOrganizeImportsCodeAction(ctx, action, data, formatOptions, preferences);
			}
			result.push(action);
		}

		const onlySourceFixAll = matchOnlyKind(`${'source.fixAll' satisfies typeof vscode.CodeActionKind.SourceFixAll}.ts`);
		if (onlySourceFixAll) {
			const action: vscode.CodeAction = {
				title: 'Fix All',
				kind: onlySourceFixAll,
			};
			const data: FixAllData = {
				uri: document.uri,
				type: 'fixAll',
				fileName,
				fixIds: [
					fixNames.classIncorrectlyImplementsInterface,
					fixNames.awaitInSyncFunction,
					fixNames.unreachableCode,
				],
			};
			if (resolveEditSupport) {
				action.data = data;
			}
			else {
				wranUnsupportResolve();
				resolveFixAllCodeAction(ctx, action, data, formatOptions, preferences);
			}
			result.push(action);
		}

		const onlyRemoveUnused = matchOnlyKind(`${'source' satisfies typeof vscode.CodeActionKind.Source}.removeUnused.ts`);
		if (onlyRemoveUnused) {
			const action: vscode.CodeAction = {
				title: 'Remove all unused code',
				kind: onlyRemoveUnused,
			};
			const data: FixAllData = {
				uri: document.uri,
				type: 'fixAll',
				fileName,
				fixIds: [
					// not working and throw
					fixNames.unusedIdentifier,
					// TODO: remove patching
					'unusedIdentifier_prefix',
					'unusedIdentifier_deleteImports',
					'unusedIdentifier_delete',
					'unusedIdentifier_infer',
				],
			};
			if (resolveEditSupport) {
				action.data = data;
			}
			else {
				wranUnsupportResolve();
				resolveFixAllCodeAction(ctx, action, data, formatOptions, preferences);
			}
			result.push(action);
		}

		const onlyAddMissingImports = matchOnlyKind(`${'source' satisfies typeof vscode.CodeActionKind.Source}.addMissingImports.ts`);
		if (onlyAddMissingImports) {
			const action: vscode.CodeAction = {
				title: 'Add all missing imports',
				kind: onlyAddMissingImports,
			};
			const data: FixAllData = {
				uri: document.uri,
				type: 'fixAll',
				fileName,
				fixIds: [
					// not working and throw
					fixNames.fixImport,
					// TODO: remove patching
					'fixMissingImport',
				],
			};
			if (resolveEditSupport) {
				action.data = data;
			}
			else {
				wranUnsupportResolve();
				resolveFixAllCodeAction(ctx, action, data, formatOptions, preferences);
			}
			result.push(action);
		}

		for (const codeAction of result) {
			if (codeAction.diagnostics === undefined) {
				codeAction.diagnostics = context.diagnostics;
			}
		}

		return result;

		function matchOnlyKind(kind: string) {
			if (context.only) {
				for (const only of context.only) {

					const a = only.split('.');
					const b = kind.split('.');

					if (a.length <= b.length) {

						let matchNums = 0;

						for (let i = 0; i < a.length; i++) {
							if (a[i] == b[i]) {
								matchNums++;
							}
						}

						if (matchNums === a.length) {
							return only;
						}
					}
				}
			}
		}
		function convertCodeFixAction(codeFix: ts.CodeFixAction, diagnostics: vscode.Diagnostic[], kind: vscode.CodeActionKind) {
			const edit = convertFileTextChanges(codeFix.changes, ctx.fileNameToUri, ctx.getTextDocument);
			const codeActions: vscode.CodeAction[] = [];
			const fix: vscode.CodeAction = {
				title: codeFix.description,
				kind,
				edit,
			};
			fix.diagnostics = diagnostics;
			codeActions.push(fix);
			if (codeFix.fixAllDescription && codeFix.fixId) {
				const fixAll: vscode.CodeAction = {
					title: codeFix.fixAllDescription,
					kind,
				};
				const data: FixAllData = {
					uri: document.uri,
					type: 'fixAll',
					fileName,
					fixIds: [codeFix.fixId],
				};
				if (resolveEditSupport) {
					fixAll.data = data;
				}
				else {
					wranUnsupportResolve();
					resolveFixAllCodeAction(ctx, fixAll, data, formatOptions, preferences);
				}
				fixAll.diagnostics = diagnostics;
				codeActions.push(fixAll);
			}
			return codeActions;
		}
		function convertApplicableRefactorInfo(refactor: ts.ApplicableRefactorInfo) {
			const codeActions: vscode.CodeAction[] = [];
			for (const action of refactor.actions) {
				const codeAction: vscode.CodeAction = {
					title: action.description,
					kind: action.kind,
				};
				if (action.notApplicableReason) {
					codeAction.disabled = { reason: action.notApplicableReason };
				}
				if (refactor.inlineable) {
					codeAction.isPreferred = true;
				}
				const data: RefactorData = {
					uri: document.uri,
					type: 'refactor',
					fileName,
					range: { pos: start, end: end },
					refactorName: refactor.name,
					actionName: action.name,
				};
				const hasCommand = renameCommandRefactors.has(action.kind!);
				if (hasCommand && resolveCommandSupport && resolveEditSupport) {
					codeAction.data = data;
				}
				else if (!hasCommand && resolveEditSupport) {
					codeAction.data = data;
				}
				else if (!codeAction.disabled) {
					wranUnsupportResolve();
					resolveRefactorCodeAction(ctx, codeAction, data, document, formatOptions, preferences);
				}
				codeActions.push(codeAction);
			}
			return codeActions;
		}
	};
}
