import { SourceScript, forEachEmbeddedCode, type DocumentSelector, type FileChangeType, type FileType, type LanguageServicePlugin, type LanguageServicePluginInstance, type LocationLink, type ProviderResult, type LanguageServiceContext } from '@volar/language-service';
import { Emitter } from 'vscode-jsonrpc';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { DiagnosticOptions, ILogger, IMdLanguageService, IMdParser, ITextDocument, IWorkspace } from 'vscode-markdown-languageservice';
import { LogLevel, createLanguageService, githubSlugifier } from 'vscode-markdown-languageservice';
import { URI, Utils } from 'vscode-uri';
import MarkdownIt = require('markdown-it');

export interface Provide {
	'markdown/languageService': () => IMdLanguageService;
}

const md = new MarkdownIt();

export function create({
	documentSelector = ['markdown'],
	fileExtensions = [
		'md',
		'mkd',
		'mdwn',
		'mdown',
		'markdown',
		'markdn',
		'mdtxt',
		'mdtext',
		'workbook',
	],
	getDiagnosticOptions = async (_document, context) => {
		return await context.env.getConfiguration?.('markdown.validate');
	},
}: {
	documentSelector?: DocumentSelector;
	fileExtensions?: string[];
	getDiagnosticOptions?(document: TextDocument, context: LanguageServiceContext): ProviderResult<DiagnosticOptions | undefined>;
} = {}): LanguageServicePlugin {
	return {
		name: 'markdown',
		capabilities: {
			codeActionProvider: {},
			completionProvider: {
				triggerCharacters: ['.', '/', '#'],
			},
			definitionProvider: true,
			diagnosticProvider: true,
			documentHighlightProvider: true,
			documentLinkProvider: {
				resolveProvider: true,
			},
			documentSymbolProvider: true,
			// fileReferencesProvider: true
			foldingRangeProvider: true,
			hoverProvider: true,
			referencesProvider: true,
			renameProvider: {
				prepareProvider: true,
			},
			selectionRangeProvider: true,
			workspaceSymbolProvider: true,
		},
		create(context): LanguageServicePluginInstance<Provide> {
			const logger: ILogger = {
				level: LogLevel.Off,
				log(_logLevel, message) {
					context.env.console?.log(message);
				}
			};
			const parser: IMdParser = {
				slugifier: githubSlugifier,
				async tokenize(document) {
					return md.parse(document.getText(), {});
				}
			};
			const workspace = getMarkdownWorkspace();
			const ls = createLanguageService({
				logger,
				parser,
				workspace: workspace.workspace,
			});
			const firedDocumentChanges = new Map<string, number>();
			const fsSourceScripts = new Map<string, SourceScript<URI> | undefined>();
			const fileWatcher = context.env.onDidChangeWatchedFiles?.(event => {
				for (const change of event.changes) {
					fsSourceScripts.delete(change.uri);
				}
			});

			return {
				dispose() {
					ls.dispose();
					workspace.dispose();
					fileWatcher?.dispose();
				},

				provide: {
					'markdown/languageService': () => ls
				},

				provideCodeActions(document, range, context, token) {
					if (prepare(document)) {
						return ls.getCodeActions(document, range, context, token);
					}
				},

				async provideCompletionItems(document, position, _context, token) {
					if (prepare(document)) {
						const items = await ls.getCompletionItems(
							document,
							position,
							{},
							token
						);
						return {
							isIncomplete: false,
							items
						};
					}
				},

				async provideDefinition(document, position, token) {
					if (prepare(document)) {
						let locations = await ls.getDefinition(document, position, token);

						if (!locations) {
							return;
						}

						if (!Array.isArray(locations)) {
							locations = [locations];
						}

						return locations.map<LocationLink>(location => ({
							targetUri: location.uri,
							targetRange: location.range,
							targetSelectionRange: location.range,
						}));
					}
				},

				async provideDiagnostics(document, token) {
					if (prepare(document)) {
						const configuration = await getDiagnosticOptions(document, context);
						if (configuration) {
							return ls.computeDiagnostics(document, configuration, token);
						}
					}
				},

				provideDocumentHighlights(document, position, token) {
					if (prepare(document)) {
						return ls.getDocumentHighlights(document, position, token);
					}
				},

				async provideDocumentLinks(document, token) {
					if (prepare(document)) {
						return await ls.getDocumentLinks(document, token);
					}
				},

				provideDocumentSymbols(document, token) {
					if (prepare(document)) {
						return ls.getDocumentSymbols(
							document,
							{ includeLinkDefinitions: true },
							token
						);
					}
				},

				provideFileReferences(document, token) {
					if (prepare(document)) {
						return ls.getFileReferences(URI.parse(document.uri), token);
					}
				},

				provideFoldingRanges(document, token) {
					if (prepare(document)) {
						return ls.getFoldingRanges(document, token);
					}
				},

				provideHover(document, position, token) {
					if (prepare(document)) {
						return ls.getHover(document, position, token);
					}
				},

				provideReferences(document, position, referenceContext, token) {
					if (prepare(document)) {
						return ls.getReferences(
							document,
							position,
							referenceContext,
							token
						);
					}
				},

				provideRenameEdits(document, position, newName, token) {
					if (prepare(document)) {
						return ls.getRenameEdit(document, position, newName, token);
					}
				},

				provideRenameRange(document, position, token) {
					if (prepare(document)) {
						return ls.prepareRename(document, position, token);
					}
				},

				provideSelectionRanges(document, positions, token) {
					if (prepare(document)) {
						return ls.getSelectionRanges(document, positions, token);
					}
				},

				provideWorkspaceSymbols(query, token) {
					return ls.getWorkspaceSymbols(query, token);
				},

				async resolveDocumentLink(link, token) {
					return await ls.resolveDocumentLink(link, token) ?? link;
				}
			};

			function prepare(document: TextDocument) {
				if (matchDocument(documentSelector, document)) {
					if (firedDocumentChanges.get(document.uri) !== document.version) {
						firedDocumentChanges.set(document.uri, document.version);
						workspace.onDidChangeMarkdownDocument.fire(document);
					}
					return true;
				}
				return false;
			}

			function getMarkdownWorkspace() {
				const onDidChangeMarkdownDocument = new Emitter<TextDocument>();
				const onDidCreateMarkdownDocument = new Emitter<TextDocument>();
				const onDidDeleteMarkdownDocument = new Emitter<URI>();
				const { fs, onDidChangeWatchedFiles } = context.env;
				const fileWatcher = onDidChangeWatchedFiles?.(event => {
					for (const change of event.changes) {
						switch (change.type) {
							case 2 satisfies typeof FileChangeType.Changed: {
								const document = getTextDocument(URI.parse(change.uri));
								if (document) {
									onDidChangeMarkdownDocument.fire(document);
								}
								break;
							}
							case 1 satisfies typeof FileChangeType.Created: {
								const document = getTextDocument(URI.parse(change.uri));
								if (document) {
									onDidCreateMarkdownDocument.fire(document);
								}
								break;
							}
							case 3 satisfies typeof FileChangeType.Deleted: {
								onDidDeleteMarkdownDocument.fire(URI.parse(change.uri));
								break;
							}
						}
					}
				});
				const workspace: IWorkspace = {
					async getAllMarkdownDocuments() {
						// TODO: Add opened files (such as untitled files)
						// const openTextDocumentResults = this.documents.all()
						// 	.filter(doc => this.isRelevantMarkdownDocument(doc));

						return (await Promise.all(context.env.workspaceFolders.map(findMarkdownFilesInWorkspace))).flat();
					},

					getContainingDocument(resource) {
						const decoded = context.decodeEmbeddedDocumentUri(resource);
						if (decoded) {
							return {
								uri: decoded[0],
								children: [],
							};
						}
					},

					hasMarkdownDocument(resource) {
						const document = getTextDocument(resource);
						return Boolean(document && matchDocument(documentSelector, document));
					},

					onDidChangeMarkdownDocument: onDidChangeMarkdownDocument.event,

					onDidCreateMarkdownDocument: onDidCreateMarkdownDocument.event,

					onDidDeleteMarkdownDocument: onDidDeleteMarkdownDocument.event,

					async openMarkdownDocument(resource) {
						return getTextDocument(resource);
					},

					async readDirectory(resource) {
						const directory = await fs?.readDirectory(resource) ?? [];
						return directory
							.filter(file => file[1] !== 0 satisfies FileType.Unknown)
							.map(([fileName, fileType]) => [
								fileName,
								{ isDirectory: fileType === 2 satisfies FileType.Directory }
							]);
					},

					async stat(resource) {
						const stat = await fs?.stat(resource);
						if (stat?.type === 0 satisfies FileType.Unknown) {
							return;
						}
						return { isDirectory: stat?.type === 2 satisfies FileType.Directory };
					},

					workspaceFolders: context.env.workspaceFolders,
				};

				return {
					workspace,
					onDidChangeMarkdownDocument,
					onDidCreateMarkdownDocument,
					onDidDeleteMarkdownDocument,
					dispose() {
						fileWatcher?.dispose();
						onDidDeleteMarkdownDocument.dispose();
						onDidCreateMarkdownDocument.dispose();
						onDidChangeMarkdownDocument.dispose();
					},
				};
			}

			async function findMarkdownFilesInWorkspace(folder: URI) {
				const { fs } = context.env;
				const files = await fs?.readDirectory(folder) ?? [];
				const docs: ITextDocument[] = [];
				await Promise.all(
					files.map(async ([fileName, fileType]) => {
						if (fileType === 2 satisfies FileType.Directory && fileName !== 'node_modules') {
							for (const doc of await findMarkdownFilesInWorkspace(Utils.joinPath(folder, fileName))) {
								docs.push(doc);
							}
						}
						else if (fileExtensions.some(ext => fileName.endsWith('.' + ext))) {
							const fileUri = Utils.joinPath(folder, fileName);
							let sourceScript = context.language.scripts.get(fileUri);
							if (!sourceScript) {
								if (!fsSourceScripts.has(fileUri.toString())) {
									fsSourceScripts.set(fileUri.toString(), undefined);
									const fileContent = await fs?.readFile(fileUri);
									if (fileContent !== undefined) {
										fsSourceScripts.set(fileUri.toString(), context.language.scripts.set(fileUri, {
											getText(start, end) {
												return fileContent.substring(start, end);
											},
											getLength() {
												return fileContent.length;
											},
											getChangeRange() {
												return undefined;
											},
										}));
										context.language.scripts.delete(fileUri);
									}
								}
								sourceScript = fsSourceScripts.get(fileUri.toString());
							}
							if (sourceScript?.generated) {
								for (const virtualCode of forEachEmbeddedCode(sourceScript.generated.root)) {
									if (matchDocument(documentSelector, virtualCode)) {
										const uri = context.encodeEmbeddedDocumentUri(sourceScript.id, virtualCode.id);
										const doc = context.documents.get(uri, virtualCode.languageId, virtualCode.snapshot);
										docs.push(doc);
									}
								}
							}
							else if (sourceScript) {
								const doc = context.documents.get(sourceScript.id, sourceScript.languageId, sourceScript.snapshot);
								if (doc && matchDocument(documentSelector, doc)) {
									docs.push(doc);
								}
							}
						}
					}),
				);
				return docs;
			}

			function getTextDocument(uri: URI) {
				const decoded = context.decodeEmbeddedDocumentUri(uri);
				if (decoded) {
					const sourceScript = context.language.scripts.get(decoded[0]);
					const virtualCode = sourceScript?.generated?.embeddedCodes.get(decoded[1]);
					if (virtualCode) {
						return context.documents.get(uri, virtualCode.languageId, virtualCode.snapshot);
					}
				}
				else {
					const sourceScript = context.language.scripts.get(uri);
					if (sourceScript) {
						return context.documents.get(uri, sourceScript.languageId, sourceScript.snapshot);
					}
				}
			}
		},
	};
}

function matchDocument(selector: DocumentSelector, document: { languageId: string; }) {
	for (const sel of selector) {
		if (sel === document.languageId || (typeof sel === 'object' && sel.language === document.languageId)) {
			return true;
		}
	}
	return false;
}
