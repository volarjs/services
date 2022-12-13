import type { LanguageServicePlugin, LanguageServicePluginContext } from '@volar/language-service';
import * as shared from '@volar/shared';
import { ESLint, Linter } from 'eslint';
import type * as ts from 'typescript/lib/tsserverlibrary';

type Diagnostic = NonNullable<Awaited<ReturnType<NonNullable<NonNullable<LanguageServicePlugin['validation']>['onSemantic']>>>>[number];
type CodeAction = NonNullable<Awaited<ReturnType<NonNullable<NonNullable<LanguageServicePlugin['codeAction']>['on']>>>>[number];

export = function (resolveConfig: (program: ts.Program) => Linter.Config): LanguageServicePlugin {

	let ctx: LanguageServicePluginContext;

	const instances = new WeakMap<ts.Program, ESLint>();
	const uriToLintResult = new Map<string, ESLint.LintResult[]>();

	return {

		setup(_ctx) {
			ctx = _ctx;
		},

		validation: {

			async onSemantic(document) {

				const eslint = getEslint(ctx.typescript.languageService.getProgram()!);
				const lintResult = await eslint.lintText(
					document.getText(),
					{ filePath: shared.getPathOfUri(document.uri) },
				);
				uriToLintResult.set(document.uri, lintResult);
				const diagnostics: Diagnostic[] = [];

				for (let i = 0; i < lintResult.length; i++) {
					const result = lintResult[i];
					for (let j = 0; j < result.messages.length; j++) {
						const message = result.messages[j];
						if (message.severity === 0) {
							continue;
						}
						if (!message.line || !message.column) {
							continue;
						}
						diagnostics.push({
							source: 'eslint',
							code: message.ruleId ?? undefined,
							message: message.message,
							severity: message.severity === 1 ? 2 : 1,
							range: {
								start: {
									line: message.line - 1,
									character: message.column - 1,
								},
								end: {
									line: message.endLine ? message.endLine - 1 : message.line - 1,
									character: message.endColumn ? message.endColumn - 1 : message.column - 1,
								},
							},
							data: [i, j],
						});
					}
				}

				return diagnostics;
			}
		},

		codeAction: {

			on(document, range, codeActionContext) {

				const result: CodeAction[] = [];

				for (const diagnostic of codeActionContext.diagnostics) {

					if (diagnostic.source !== 'eslint') {
						continue;
					}

					const lintResult = uriToLintResult.get(document.uri);
					if (!lintResult) {
						continue;
					}

					const message = lintResult[diagnostic.data[0]]?.messages[diagnostic.data[1]];
					if (!message.fix) {
						continue;
					}

					const codeAction: CodeAction = {
						title: 'Fix ESLint: ' + message.message,
						kind: 'quickfix',
						edit: {
							changes: {
								[document.uri]: [{
									range: {
										start: document.positionAt(message.fix.range[0]),
										end: document.positionAt(message.fix.range[1]),
									},
									newText: message.fix.text,
								}],
							},
						},
					};
					result.push(codeAction);
				}

				return result;
			},
		},
	}

	function getEslint(program: ts.Program) {
		return instances.get(program) ?? instances.set(program, new ESLint({ baseConfig: resolveConfig(program) })).get(program)!;
	}
}
