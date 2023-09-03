import { FileType, forEachEmbeddedFile, type Service } from '@volar/language-service';
import MarkdownIt = require('markdown-it');
import { Emitter, FileChangeType } from 'vscode-languageserver-protocol';
import { type TextDocument } from 'vscode-languageserver-textdocument';
import { createLanguageService, githubSlugifier, DiagnosticLevel, type ILogger, type IMdLanguageService, type IMdParser, type IWorkspace, LogLevel } from 'vscode-markdown-languageservice';
import { URI } from 'vscode-uri';

export interface Provide {
	'markdown/languageService': () => IMdLanguageService;
}

const md = new MarkdownIt();

function isMarkdown(document: TextDocument): boolean {
	return document.languageId === 'markdown';
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) {
		throw new Error(message);
	}
}

export function create(): Service<Provide | undefined> {
	return (context) => {
		if (!context) {
			return {
				provide: undefined
			};
		}

		let lastProjectVersion = context.host.getProjectVersion();
		assert(context.env, 'context.env must be defined');
		const { fs, onDidChangeWatchedFiles } = context.env;
		assert(fs, 'context.env.fs must be defined');
		assert(
			onDidChangeWatchedFiles,
			'context.env.fs.onDidChangeWatchedFiles must be defined'
		);

		const logger: ILogger = {
			level: LogLevel.Off,

			log() { }
		};

		const parser: IMdParser = {
			slugifier: githubSlugifier,

			async tokenize(document) {
				return md.parse(document.getText(), {});
			}
		};

		const onDidChangeMarkdownDocument = new Emitter<TextDocument>();
		const onDidCreateMarkdownDocument = new Emitter<TextDocument>();
		const onDidDeleteMarkdownDocument = new Emitter<URI>();

		const fileWatcher = onDidChangeWatchedFiles((event) => {
			for (const change of event.changes) {
				switch (change.type) {
					case FileChangeType.Changed: {
						const document = context.getTextDocument(change.uri);
						if (document) {
							onDidChangeMarkdownDocument.fire(document);
						}
						break;
					}

					case FileChangeType.Created: {
						const document = context.getTextDocument(change.uri);
						if (document) {
							onDidCreateMarkdownDocument.fire(document);
						}
						break;
					}

					case FileChangeType.Deleted: {
						onDidDeleteMarkdownDocument.fire(URI.parse(change.uri));
						break;
					}
				}
			}
		});

		const workspace: IWorkspace = {
			async getAllMarkdownDocuments() {
				return [];
			},

			getContainingDocument() {
				return undefined;
			},

			hasMarkdownDocument(resource) {
				const document = context.getTextDocument(String(resource));
				return Boolean(document && isMarkdown(document));
			},

			onDidChangeMarkdownDocument: onDidChangeMarkdownDocument.event,

			onDidCreateMarkdownDocument: onDidCreateMarkdownDocument.event,

			onDidDeleteMarkdownDocument: onDidDeleteMarkdownDocument.event,

			async openMarkdownDocument(resource) {
				return context.getTextDocument(String(resource));
			},

			async readDirectory(resource) {
				const directory = await fs.readDirectory(String(resource));
				return directory.map(([fileName, fileType]) => [
					fileName,
					{ isDirectory: fileType === FileType.Directory }
				]);
			},

			async stat(resource) {
				const stat = await fs.stat(String(resource));
				if (stat) {
					return { isDirectory: stat.type === FileType.Directory };
				}
			},

			workspaceFolders: []
		};

		const ls = createLanguageService({
			logger,
			parser,
			workspace
		});

		const syncedVersions = new Map<string, TextDocument>();

		const sync = () => {
			const newProjectVersion = context.host.getProjectVersion();
			const shouldUpdate = newProjectVersion !== lastProjectVersion;
			if (!shouldUpdate) {
				return;
			}

			lastProjectVersion = newProjectVersion;
			const oldVersions = new Set(syncedVersions.keys());
			const newVersions = new Map<string, TextDocument>();

			for (const { root } of context.virtualFiles.allSources()) {
				forEachEmbeddedFile(root, (embedded) => {
					const document = context.getTextDocument(embedded.fileName);
					if (document && isMarkdown(document)) {
						newVersions.set(String(document.uri), document);
					}
				});
			}

			for (const [uri, document] of newVersions) {
				const old = syncedVersions.get(uri);
				syncedVersions.set(uri, document);
				if (old) {
					onDidChangeMarkdownDocument.fire(document);
				} else {
					onDidCreateMarkdownDocument.fire(document);
				}
			}

			for (const uri of oldVersions) {
				if (!newVersions.has(uri)) {
					syncedVersions.delete(uri);
					onDidDeleteMarkdownDocument.fire(URI.parse(uri));
				}
			}
		};

		return {
			dispose() {
				ls.dispose();
				fileWatcher.dispose();
				onDidDeleteMarkdownDocument.dispose();
				onDidCreateMarkdownDocument.dispose();
				onDidChangeMarkdownDocument.dispose();
			},

			provide: {
				'markdown/languageService': () => ls
			},

			async provideCodeActions(document, range, context, token) {
				if (isMarkdown(document)) {
					return ls.getCodeActions(document, range, context, token);
				}
			},

			async provideCompletionItems(document, position, context, token) {
				if (isMarkdown(document)) {
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

			async provideDiagnostics(document, token) {
				if (isMarkdown(document)) {
					sync();

					return ls.computeDiagnostics(
						document,
						{
							ignoreLinks: [],
							validateDuplicateLinkDefinitions: DiagnosticLevel.warning,
							validateFileLinks: DiagnosticLevel.warning,
							validateFragmentLinks: DiagnosticLevel.warning,
							validateMarkdownFileLinkFragments: DiagnosticLevel.warning,
							validateReferences: DiagnosticLevel.warning,
							validateUnusedLinkDefinitions: DiagnosticLevel.warning
						},
						token
					);
				}
			},

			async provideDocumentHighlights(document, position, token) {
				if (isMarkdown(document)) {
					return ls.getDocumentHighlights(document, position, token);
				}
			},

			async provideDocumentLinks(document, token) {
				if (isMarkdown(document)) {
					return ls.getDocumentLinks(document, token);
				}
			},

			async provideDocumentSymbols(document, token) {
				if (isMarkdown(document)) {
					return ls.getDocumentSymbols(
						document,
						{ includeLinkDefinitions: true },
						token
					);
				}
			},

			async provideFileReferences(document, token) {
				if (isMarkdown(document)) {
					return ls.getFileReferences(URI.parse(document.uri), token);
				}
			},

			async provideFoldingRanges(document, token) {
				if (isMarkdown(document)) {
					return ls.getFoldingRanges(document, token);
				}
			},

			async provideReferences(document, position, token) {
				if (isMarkdown(document)) {
					return ls.getReferences(
						document,
						position,
						{ includeDeclaration: true },
						token
					);
				}
			},

			async provideRenameEdits(document, position, newName, token) {
				if (isMarkdown(document)) {
					console.log(document);
					const result = ls.getRenameEdit(document, position, newName, token);
					console.log(result);
					return result;
				}
			},

			async provideRenameRange(document, position, token) {
				if (isMarkdown(document)) {
					return ls.prepareRename(document, position, token);
				}
			},

			async provideSelectionRanges(document, positions, token) {
				if (isMarkdown(document)) {
					return ls.getSelectionRanges(document, positions, token);
				}
			},

			async provideWorkspaceSymbols(query, token) {
				return ls.getWorkspaceSymbols(query, token);
			},

			async resolveDocumentLink(link, token) {
				const result = await ls.resolveDocumentLink(link, token);

				return result || link;
			}
		};
	};
}

export default create;
