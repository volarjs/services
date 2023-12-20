import type { CodeAction, Diagnostic, ServicePluginInstance, ServicePlugin } from '@volar/language-service';
import { ESLint, Linter } from 'eslint';
import type * as ts from 'typescript/lib/tsserverlibrary';
import type { Provide } from 'volar-service-typescript';

export function create(resolveConfig?: (program: ts.Program) => Linter.Config): ServicePlugin {

	const instances = new WeakMap<ts.Program, ESLint>();
	const uriToLintResult = new Map<string, ESLint.LintResult[]>();

	return {
		name: 'eslint',
		create(context): ServicePluginInstance {
			return {
				async provideSemanticDiagnostics(document) {

					const languageService = context.inject<Provide, 'typescript/languageService'>('typescript/languageService');
					const eslint = getEslint(languageService.getProgram()!);
					const lintResult = await eslint.lintText(
						document.getText(),
						{ filePath: context.env.uriToFileName(document.uri) },
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
								message.line = 1;
								message.column = 1;
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
								data: {
									uri: document.uri,
									version: document.version,
									indexes: [i, j],
								},
							});
						}
					}

					return diagnostics;
				},

				provideCodeActions(document, _range, codeActionContext) {

					const result: CodeAction[] = [];

					for (const diagnostic of codeActionContext.diagnostics) {

						if (diagnostic.source !== 'eslint') {
							continue;
						}

						if (diagnostic.data?.uri !== document.uri || diagnostic.data?.version !== document.version) {
							continue;
						}

						const lintResult = uriToLintResult.get(document.uri);
						const message = lintResult?.[diagnostic.data.indexes[0]]?.messages[diagnostic.data.indexes[1]];
						if (!message?.fix) {
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
			};
		},
	};

	function getEslint(program: ts.Program) {
		return instances.get(program) ?? instances.set(program, new ESLint(
			resolveConfig
				? {
					baseConfig: resolveConfig(program),
					useEslintrc: false,
				}
				: {
					useEslintrc: true,
				}
		)).get(program)!;
	}
};
