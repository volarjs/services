import type { ServicePluginInstance, ServicePlugin } from '@volar/language-service';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { LanguageService, LanguageSettings } from 'yaml-language-server';
import { getLanguageService } from 'yaml-language-server';

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
export function create(settings?: LanguageSettings): ServicePlugin {
	return {
		triggerCharacters: [' ', ':'],
		create(context): ServicePluginInstance<Provide> {

			const ls = getLanguageService({
				schemaRequestService: async (uri) => await context.env.fs?.readFile(uri) ?? '',
				telemetry: {
					send: noop,
					sendError: noop,
					sendTrack: noop
				},
				// @ts-expect-error https://github.com/redhat-developer/yaml-language-server/pull/910
				clientCapabilities: context.env?.clientCapabilities,
				workspaceContext: {
					resolveRelativePath(relativePath, resource) {
						return String(new URL(relativePath, resource));
					}
				},
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

				provideSelectionRanges(document, positions) {
					if (isYaml(document)) {
						return ls.getSelectionRanges(document, positions);
					}
				},

				resolveCodeLens(codeLens) {
					return ls.resolveCodeLens(codeLens);
				},
			};
		},
	};
}
