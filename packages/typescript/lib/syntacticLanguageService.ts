import type * as ts from 'typescript';
import type { TextDocument } from 'vscode-languageserver-textdocument';

let currentProjectVersion = -1;
let currentDocument: TextDocument | undefined;
let currentDocumentVersion: number | undefined;
let currentFileName = '';
let currentSnapshot: ts.IScriptSnapshot | undefined;
let languageService: ts.LanguageService | undefined;

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

export function getLanguageService(ts: typeof import('typescript'), document: TextDocument) {
	if (currentDocument !== document || currentDocumentVersion !== document.version) {
		currentDocument = document;
		currentFileName = '/tmp.' + (
			document.languageId === 'javascript' ? 'js' :
				document.languageId === 'typescriptreact' ? 'tsx' :
					document.languageId === 'javascriptreact' ? 'jsx' :
						'ts'
		);
		currentSnapshot = ts.ScriptSnapshot.fromString(document.getText());
		currentProjectVersion++;
	}
	languageService ??= ts.createLanguageService(host, undefined, 2 satisfies ts.LanguageServiceMode.Syntactic);
	return {
		languageService,
		fileName: currentFileName,
	};
}
