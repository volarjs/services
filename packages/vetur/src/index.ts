import { EmbeddedLanguageServicePlugin } from '@volar/vue-language-service-types';
import * as vls from 'vls';
import * as html from 'vscode-html-languageservice';
import { URI } from 'vscode-uri';
import { TextDocument } from 'vscode-html-languageservice';
import * as fs from 'fs';
import * as path from 'path';

export = function (): EmbeddedLanguageServicePlugin {

	const htmlDocuments = new WeakMap<TextDocument, html.HTMLDocument>();
	const uriToPackageJsonPath = new Map<string, string>();
	const htmlDataPrividers = new Map<string, html.IHTMLDataProvider[]>();
	const htmlLs = html.getLanguageService();

	// https://github.com/microsoft/vscode/blob/09850876e652688fb142e2e19fd00fd38c0bc4ba/extensions/html-language-features/server/src/htmlServer.ts#L183
	const htmlTriggerCharacters = ['.', ':', '<', '"', '=', '/', /* vue event shorthand */'@'];

	return {

		complete: {

			triggerCharacters: [
				...htmlTriggerCharacters,
			],

			isAdditional: true,

			// auto-complete html tag, attr from vetur component data
			on(document, position, context) {

				let result: html.CompletionList | undefined;

				if (!context.triggerCharacter || htmlTriggerCharacters.includes(context.triggerCharacter)) {
					htmlWorker(document, htmlDocument => {
						result = htmlLs.doComplete(document, position, htmlDocument);
					});
				}

				if (!context.triggerCharacter) {
					vueWorker(document, () => {
						const snippetManager = new vls.SnippetManager('', '');
						const scaffoldSnippetSources: vls.ScaffoldSnippetSources = {
							workspace: '💼',
							user: '🗒️',
							vetur: '✌'
						};
						const items = snippetManager.completeSnippets(scaffoldSnippetSources);
						if (items.length) {
							result = {
								isIncomplete: false,
								items: items,
							};
						}
					});
				}

				return result;
			},
		},

		// show hover info for html tag, attr from vetur component data
		doHover(document, position) {

			let result: html.Hover;

			htmlWorker(document, htmlDocument => {
				result = htmlLs.doHover(document, position, htmlDocument);
			});

			return result;
		},
	}

	function htmlWorker<T>(document: TextDocument, callback: (htmlDocument: html.HTMLDocument) => T) {

		const htmlDocument = getHtmlDocument(document);
		if (!htmlDocument)
			return;

		const packageJsonPath = getPackageJsonPath(document);
		if (!packageJsonPath)
			return;

		htmlLs.setDataProviders(
			false,
			getHtmlDataProviders(packageJsonPath),
		);

		return callback(htmlDocument);
	}

	function vueWorker<T>(document: TextDocument, callback: () => T) {
		if (document.languageId === 'vue') {
			return callback();
		}
	}

	function getPackageJsonPath(document: TextDocument) {

		let packageJsonPath = uriToPackageJsonPath.get(document.uri);

		if (!packageJsonPath) {

			const uri = URI.parse(document.uri);
			const fsPath = uri.fsPath;

			let lastDirname = fsPath;

			while (true) {

				const dirname = path.dirname(lastDirname);
				if (dirname === lastDirname) {
					break;
				}

				if (fs.existsSync(dirname + '/package.json')) {
					packageJsonPath = dirname + '/package.json';
					break;
				}

				lastDirname = dirname;
			}

			uriToPackageJsonPath.set(document.uri, packageJsonPath);
		}

		return packageJsonPath;
	}

	function getHtmlDataProviders(packageJsonPath: string) {

		let dataProviders = htmlDataPrividers.get(packageJsonPath);

		if (!dataProviders) {

			const tagProviderSettings = vls.getTagProviderSettings(packageJsonPath);
			const enabledTagProviders = vls.getEnabledTagProviders(tagProviderSettings);

			dataProviders = enabledTagProviders.map(provider => {
				const htmlProvider: html.IHTMLDataProvider = {
					getId: provider.getId,
					isApplicable() {
						return true;
					},
					provideTags() {
						const tags: html.ITagData[] = [];
						provider.collectTags((tag, documentation) => {
							tags.push({
								name: tag,
								description: documentation,
								attributes: [],
							});
						});
						return tags;
					},
					provideAttributes(tag) {
						const attributes: html.IAttributeData[] = [];
						provider.collectAttributes(tag, (attribute, type, documentation) => {
							if (attribute.startsWith('v-') || attribute.startsWith('@')) {
								attributes.push({
									name: attribute,
									valueSet: type,
									description: documentation,
								});
							}
							else {
								attributes.push({
									name: 'v-bind:' + attribute,
									valueSet: type,
									description: documentation,
								});
								attributes.push({
									name: ':' + attribute,
									valueSet: type,
									description: documentation,
								});
								attributes.push({
									name: attribute,
									valueSet: type,
									description: documentation,
								});
							}
						});
						return attributes;
					},
					provideValues(tag, attribute) {
						const values: html.IValueData[] = [];
						provider.collectValues(tag, attribute, value => {
							values.push({
								name: value,
							});
						});
						return values;
					},
				};
				return htmlProvider;
			});

			htmlDataPrividers.set(packageJsonPath, dataProviders);
		}

		return dataProviders;
	}

	function getHtmlDocument(document: TextDocument) {

		if (document.languageId !== 'html')
			return;

		let htmlDocument = htmlDocuments.get(document);

		if (!htmlDocument) {
			htmlDocument = htmlLs.parseHTMLDocument(document);
			htmlDocuments.set(document, htmlDocument);
		}

		return htmlDocument;
	}
}
