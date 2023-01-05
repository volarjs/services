import type { LanguageServicePlugin, Diagnostic, CodeAction } from '@volar/language-service';
import * as shared from '@volar/shared';
import type { IRule, RuleFailure } from 'tslint';

export = function (rules: IRule[]): LanguageServicePlugin {

	const diagnosticToFailure = new Map<string, RuleFailure[]>();

	return (ctx) => ({

		validation: {

			onSemantic(document) {

				if (!ctx.typescript) return

				const fileName = shared.getPathOfUri(document.uri);
				const sourceFile = ctx.typescript.languageService.getProgram()?.getSourceFile(fileName);
				if (!sourceFile) {
					return;
				}

				let failures: RuleFailure[] = [];

				for (const rule of rules) {
					if (ctx.typescript.languageServiceHost.getCancellationToken?.().isCancellationRequested()) {
						return;
					}
					const ruleSeverity = rule.getOptions().ruleSeverity;
					if (ruleSeverity === 'off') {
						continue;
					}
					const ruleFailures = rule.apply(sourceFile);
					for (const ruleFailure of ruleFailures) {
						ruleFailure.setRuleSeverity(ruleSeverity);
					}
					failures = failures.concat(ruleFailures);
				}

				diagnosticToFailure.set(document.uri, failures);

				const diagnostics: Diagnostic[] = [];

				for (let i = 0; i < failures.length; i++) {
					const failure = failures[i];
					const diagnostic: Diagnostic = {
						source: 'tslint',
						code: failure.getRuleName(),
						message: failure.getFailure(),
						range: {
							start: failure.getStartPosition().getLineAndCharacter(),
							end: failure.getEndPosition().getLineAndCharacter(),
						},
						severity: failure.getRuleSeverity() === 'error' ? 1 : 2,
						data: i,
					};
					diagnostics.push(diagnostic);
				}

				return diagnostics;
			}
		},

		codeAction: {

			on(document, range, codeActionContext) {

				const result: CodeAction[] = [];

				for (const diagnostic of codeActionContext.diagnostics) {

					const failures = diagnosticToFailure.get(document.uri);
					const failure = failures?.[diagnostic.data as number];
					if (!failure) {
						continue;
					}

					const fix = failure.getFix();
					if (!fix) {
						continue;
					}

					const replaces = Array.isArray(fix) ? fix : [fix];
					const codeAction: CodeAction = {
						title: 'Fix TSLint: ' + failure.getFailure(),
						kind: 'quickfix',
						edit: {
							changes: {
								[document.uri]: replaces.map(replace => ({
									range: {
										start: document.positionAt(replace.start),
										end: document.positionAt(replace.end),
									},
									newText: replace.text,
								})),
							},
						},
					};
					result.push(codeAction);
				}

				return result;
			},
		},
	})
}
