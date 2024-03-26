import type * as ts from 'typescript';

let currentProjectVersion = -1;
let currentFileName = '';
let currentSnapshot: ts.IScriptSnapshot | undefined;
let languageService: ts.LanguageService | undefined;
let syntaxOnlyLanguageService: ts.LanguageService | undefined;

const host: ts.LanguageServiceHost = {
	getProjectVersion: () => currentProjectVersion.toString(),
	getScriptFileNames: () => [currentFileName],
	getScriptVersion: () => currentProjectVersion.toString(),
	getScriptSnapshot: fileName => fileName === currentFileName ? currentSnapshot : undefined,
	getCompilationSettings: () => ({}),
	getCurrentDirectory: () => '',
	getDefaultLibFileName: () => '',
	readFile: () => undefined,
	fileExists: fileName => fileName === currentFileName,
};

export function getLanguageService(
	ts: typeof import('typescript'),
	snapshot: ts.IScriptSnapshot,
	languageId: string,
	syntaxOnly: boolean,
) {
	if (currentSnapshot !== snapshot) {
		currentSnapshot = snapshot;
		currentFileName = '/tmp.' + (
			languageId === 'javascript' ? 'js' :
				languageId === 'typescriptreact' ? 'tsx' :
					languageId === 'javascriptreact' ? 'jsx' :
						'ts'
		);
		currentProjectVersion++;
	}
	if (syntaxOnly) {
		syntaxOnlyLanguageService ??= ts.createLanguageService(host, undefined, ts.LanguageServiceMode.Syntactic);
		return {
			languageService: syntaxOnlyLanguageService,
			fileName: currentFileName,
		};
	}
	else {
		languageService ??= ts.createLanguageService(host);
		return {
			languageService,
			fileName: currentFileName,
		};
	}
}
