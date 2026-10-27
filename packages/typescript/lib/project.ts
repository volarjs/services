import type { LanguagePlugin, LanguageServiceContext, VirtualCode } from '@volar/language-service';
import type * as ts from 'typescript';
import type { URI } from 'vscode-uri';

// The parts of `ProjectContext['typescript']` and `LanguagePlugin['typescript']` that this package reads.
// @volar/typescript 2 declares them, volar.js 3 removed @volar/typescript; they are read structurally so that
// this package depends on neither.

export interface TypeScriptProject {
	sys: ts.System & {
		version?: number;
		sync?(): Promise<number>;
	};
	languageServiceHost: ts.LanguageServiceHost;
	getExtraServiceScript(fileName: string): TypeScriptExtraServiceScript | undefined;
	uriConverter: {
		asUri(fileName: string): URI;
		asFileName(uri: URI): string;
	};
}

export interface TypeScriptServiceScript {
	code: VirtualCode;
}

export interface TypeScriptExtraServiceScript extends TypeScriptServiceScript {
	fileName: string;
}

export interface TypeScriptLanguagePlugin {
	getServiceScript(root: VirtualCode): TypeScriptServiceScript | undefined;
	getExtraServiceScripts?(fileName: string, root: VirtualCode): TypeScriptExtraServiceScript[];
}

export function getTypeScriptProject(context: LanguageServiceContext): TypeScriptProject | undefined {
	return (context.project as { typescript?: TypeScriptProject }).typescript;
}

export function getTypeScriptLanguagePlugin(
	languagePlugin: LanguagePlugin<URI>,
): TypeScriptLanguagePlugin | undefined {
	return (languagePlugin as { typescript?: TypeScriptLanguagePlugin }).typescript;
}
