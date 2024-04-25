import type * as ts from 'typescript';

export function createSyntaxOnlyService(ts: typeof import('typescript'), syntaxOnly: boolean) {
	let currentProjectVersion = -1;
	let fileNames: string[] = [];

	const scriptInfos = new Map<string, {
		snapshot: ts.IScriptSnapshot;
		kind: ts.ScriptKind;
		version: number;
	}>();
	const host: ts.LanguageServiceHost = {
		getProjectVersion: () => currentProjectVersion.toString(),
		getScriptFileNames: () => fileNames,
		getScriptSnapshot: fileName => scriptInfos.get(fileName)!.snapshot,
		getScriptKind: fileName => scriptInfos.get(fileName)!.kind,
		getScriptVersion: fileName => scriptInfos.get(fileName)!.version.toString(),
		getCompilationSettings: () => ({}),
		getCurrentDirectory: () => '',
		getDefaultLibFileName: () => '',
		readFile: () => undefined,
		fileExists: fileName => scriptInfos.has(fileName),
	};

	return {
		languageService: syntaxOnly
			? ts.createLanguageService(host, undefined, ts.LanguageServiceMode.Syntactic)
			: ts.createLanguageService(host),
		updateFile,
	};

	function updateFile(fileName: string, snapshot: ts.IScriptSnapshot, scriptKind: ts.ScriptKind) {
		let scriptInfo = scriptInfos.get(fileName);
		if (scriptInfo?.snapshot === snapshot && scriptInfo.kind === scriptKind) {
			return;
		}
		currentProjectVersion++;
		scriptInfo = {
			snapshot,
			kind: scriptKind,
			version: (scriptInfo?.version ?? 0) + 1,
		};
		const filesChanged = !scriptInfos.has(fileName);
		scriptInfos.set(fileName, scriptInfo);
		if (filesChanged) {
			fileNames = [...scriptInfos.keys()];
		}
	}
}
