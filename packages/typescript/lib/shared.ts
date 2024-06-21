import type { TextDocument } from 'vscode-languageserver-textdocument';

export function getConfigTitle(document: TextDocument) {
	if (document.languageId === 'javascriptreact') {
		return 'javascript';
	}
	if (document.languageId === 'typescriptreact') {
		return 'typescript';
	}
	return document.languageId;
}

export function isTsDocument(document: TextDocument) {
	return document.languageId === 'javascript' ||
		document.languageId === 'typescript' ||
		document.languageId === 'javascriptreact' ||
		document.languageId === 'typescriptreact';
}

export function isJsonDocument(document: TextDocument) {
	return document.languageId === 'json' ||
		document.languageId === 'jsonc';
}

export function safeCall<T>(cb: () => T) {
	try {
		return cb();
	} catch { }
}
