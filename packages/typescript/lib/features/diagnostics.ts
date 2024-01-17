import type * as vscode from '@volar/language-service';
import type * as ts from 'typescript';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { safeCall } from '../shared';
import type { SharedContext } from '../types';

export function register(ctx: SharedContext) {
	const { ts } = ctx;

	return (
		uri: string,
		options: {
			semantic?: boolean,
			syntactic?: boolean,
			suggestion?: boolean,
			declaration?: boolean,
		},
	): vscode.Diagnostic[] => {

		const document = ctx.getTextDocument(uri);
		if (!document) return [];

		const fileName = ctx.uriToFileName(document.uri);
		const program = ctx.languageService.getProgram();
		const sourceFile = program?.getSourceFile(fileName);
		if (!program || !sourceFile) return [];

		const token: ts.CancellationToken = {
			isCancellationRequested() {
				return ctx.typescript?.languageServiceHost.getCancellationToken?.().isCancellationRequested() ?? false;
			},
			throwIfCancellationRequested() { },
		};

		let errors = safeCall(() => [
			...options.semantic ? program.getSemanticDiagnostics(sourceFile, token) : [],
			...options.syntactic ? program.getSyntacticDiagnostics(sourceFile, token) : [],
			...options.suggestion ? ctx.languageService.getSuggestionDiagnostics(fileName) : [],
		]) ?? [];

		if (options.declaration && getEmitDeclarations(program.getCompilerOptions())) {
			errors = errors.concat(program.getDeclarationDiagnostics(sourceFile, token));
		}

		return translateDiagnostics(document, errors);

		function translateDiagnostics(document: TextDocument, input: readonly ts.Diagnostic[]) {
			return input.map(diag => translateDiagnostic(diag, document)).filter((v): v is NonNullable<typeof v> => !!v);
		}
		function translateDiagnostic(diag: ts.Diagnostic, document: TextDocument): vscode.Diagnostic | undefined {

			if (diag.start === undefined) return;
			if (diag.length === undefined) return;

			const diagnostic: vscode.Diagnostic = {
				range: {
					start: document.positionAt(diag.start),
					end: document.positionAt(diag.start + diag.length),
				},
				severity: translateErrorType(diag.category),
				source: 'ts',
				code: diag.code,
				message: getMessageText(diag),
			};

			if (diag.relatedInformation) {
				diagnostic.relatedInformation = diag.relatedInformation
					.map(rErr => translateDiagnosticRelated(rErr))
					.filter((v): v is NonNullable<typeof v> => !!v);
			}
			if (diag.reportsUnnecessary) {
				if (diagnostic.tags === undefined) diagnostic.tags = [];
				diagnostic.tags.push(1 satisfies typeof vscode.DiagnosticTag.Unnecessary);
			}
			if (diag.reportsDeprecated) {
				if (diagnostic.tags === undefined) diagnostic.tags = [];
				diagnostic.tags.push(2 satisfies typeof vscode.DiagnosticTag.Deprecated);
			}

			return diagnostic;
		}
		function translateDiagnosticRelated(diag: ts.Diagnostic): vscode.DiagnosticRelatedInformation | undefined {

			if (diag.start === undefined) return;
			if (diag.length === undefined) return;

			let document: TextDocument | undefined;
			if (diag.file) {
				document = ctx.getTextDocument(ctx.fileNameToUri(diag.file.fileName));
			}
			if (!document) return;

			const diagnostic: vscode.DiagnosticRelatedInformation = {
				location: {
					uri: document.uri,
					range: {
						start: document.positionAt(diag.start),
						end: document.positionAt(diag.start + diag.length),
					},
				},
				message: getMessageText(diag),
			};

			return diagnostic;
		}
		function translateErrorType(input: ts.DiagnosticCategory): vscode.DiagnosticSeverity {
			switch (input) {
				case ts.DiagnosticCategory.Warning: return 2 satisfies typeof vscode.DiagnosticSeverity.Warning;
				case ts.DiagnosticCategory.Error: return 1 satisfies typeof vscode.DiagnosticSeverity.Error;
				case ts.DiagnosticCategory.Suggestion: return 4 satisfies typeof vscode.DiagnosticSeverity.Hint;
				case ts.DiagnosticCategory.Message: return 3 satisfies typeof vscode.DiagnosticSeverity.Information;
			}
			return 1 satisfies typeof vscode.DiagnosticSeverity.Error;
		}
	};
}

function getMessageText(diag: ts.Diagnostic | ts.DiagnosticMessageChain, level = 0) {
	let messageText = '  '.repeat(level);

	if (typeof diag.messageText === 'string') {
		messageText += diag.messageText;
	}
	else {
		messageText += diag.messageText.messageText;
		if (diag.messageText.next) {
			for (const info of diag.messageText.next) {
				messageText += '\n' + getMessageText(info, level + 1);
			}
		}
	}

	return messageText;
}
export function getEmitDeclarations(compilerOptions: ts.CompilerOptions): boolean {
	return !!(compilerOptions.declaration || compilerOptions.composite);
}
