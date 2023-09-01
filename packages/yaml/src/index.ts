import { type Service } from '@volar/language-service';
import { type TextDocument } from 'vscode-languageserver-textdocument';
import { type LanguageSettings, type LanguageService } from 'yaml-language-server';
import { getLanguageService } from 'yaml-language-server/lib/umd/languageservice/yamlLanguageService.js';

export interface Provide {
	'yaml/languageService': () => LanguageService;
}

function isYaml(document: TextDocument): boolean {
	return document.languageId === 'yaml';
}

function noop(): undefined { }

/**
 * Create a Volar language service for YAML documents.
 */
export function createYamlService(
	settings: LanguageSettings
): Service<Provide | undefined> {
	return (context) => {
		const ls = getLanguageService({
			async schemaRequestService(uri) {
				if (uri.startsWith('file:') && context?.env.fs) {
					const result = await context?.env.fs.readFile(uri);
					if (result) {
						return result;
					}

					throw new Error(`No such file: ${uri}`);
				}

				// @ts-expect-error This exists as an experimental API in Node 16.
				const response = await fetch(uri);
				if (response.ok) {
					return response.text();
				}

				throw new Error(await response.text());
			},
			telemetry: {
				send: noop,
				sendError: noop,
				sendTrack: noop
			},
			// @ts-expect-error https://github.com/redhat-developer/yaml-language-server/pull/910
			clientCapabilities: context?.env?.clientCapabilities,
			workspaceContext: {
				resolveRelativePath(relativePath, resource) {
					return String(new URL(relativePath, resource));
				}
			}
		});

		ls.configure({
			completion: true,
			customTags: [],
			format: true,
			hover: true,
			isKubernetes: false,
			validate: true,
			yamlVersion: '1.2',
			...settings
		});

		return {
			provide: {
				'yaml/languageService': () => ls
			},

			triggerCharacters: [' ', ':'],

			provideCodeActions(document, range, context) {
				if (isYaml(document)) {
					return ls.getCodeAction(document, {
						context,
						range,
						textDocument: document
					});
				}
			},

			provideCodeLenses(document) {
				if (isYaml(document)) {
					return ls.getCodeLens(document);
				}
			},

			provideCompletionItems(document, position) {
				if (isYaml(document)) {
					return ls.doComplete(document, position, false);
				}
			},

			provideDefinition(document, position) {
				if (isYaml(document)) {
					return ls.doDefinition(document, { position, textDocument: document });
				}
			},

			provideDiagnostics(document) {
				if (isYaml(document)) {
					return ls.doValidation(document, false);
				}
			},

			provideDocumentSymbols(document) {
				if (isYaml(document)) {
					return ls.findDocumentSymbols2(document, {});
				}
			},

			provideHover(document, position) {
				if (isYaml(document)) {
					return ls.doHover(document, position);
				}
			},

			provideDocumentLinks(document) {
				if (isYaml(document)) {
					return ls.findLinks(document);
				}
			},

			provideFoldingRanges(document) {
				if (isYaml(document)) {
					return ls.getFoldingRanges(document, {});
				}
			},

			provideOnTypeFormattingEdits(document, position, ch, options) {
				if (isYaml(document)) {
					return ls.doDocumentOnTypeFormatting(document, {
						ch,
						options,
						position,
						textDocument: document
					});
				}
			},

			provideDocumentFormattingEdits(document) {
				if (isYaml(document)) {
					return ls.doFormat(document, {});
				}
			},

			provideSelectionRanges(document, positions) {
				if (isYaml(document)) {
					return ls.getSelectionRanges(document, positions);
				}
			},

			resolveCodeLens(codeLens) {
				return ls.resolveCodeLens(codeLens);
			}
		};
	};
}
