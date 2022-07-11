import { EmbeddedLanguageServicePlugin } from '@volar/vue-language-service-types';
import * as vls from 'vls';
import * as html from 'vscode-html-languageservice';
import { URI } from 'vscode-uri';
import { TextDocument } from 'vscode-html-languageservice';
import * as fs from 'fs';
import * as path from 'path';

export = function (): EmbeddedLanguageServicePlugin {

	const htmlDocuments = new WeakMap<TextDocument, html.HTMLDocument>();
	const packageJsonPaths = new Map<string, string>();
	const dataPrividers = new Map<string, html.IHTMLDataProvider[]>();
	const htmlLs = html.getLanguageService();

	return {

		complete: {

			// https://github.com/microsoft/vscode/blob/09850876e652688fb142e2e19fd00fd38c0bc4ba/extensions/html-language-features/server/src/htmlServer.ts#L183
			triggerCharacters: ['.', ':', '<', '"', '=', '/', /* vue event shorthand */'@'],

			isAdditional: true,

			// auto-complete html tag, attr from vetur component data
			on(document, position, context) {
				return worker(document, htmlDocument => {
					return htmlLs.doComplete(document, position, htmlDocument);
				});
			},
		},

		// show hover info for html tag, attr from vetur component data
		doHover(document, position) {
			return worker(document, htmlDocument => {
				return htmlLs.doHover(document, position, htmlDocument);
			});
		},
	}

	function worker<T>(document: TextDocument, callback: (htmlDocument: html.HTMLDocument) => T) {

		const htmlDocument = getHtmlDocument(document);
		if (!htmlDocument)
			return;

		const packageJsonPath = getPackageJsonPath(document);
		if (!packageJsonPath)
			return;

		htmlLs.setDataProviders(
			false,
			getDataProviders(packageJsonPath),
		);

		return callback(htmlDocument);
	}

	function getPackageJsonPath(document: TextDocument) {

		let packageJsonPath = packageJsonPaths.get(document.uri);

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

			packageJsonPaths.set(document.uri, packageJsonPath);
		}

		return packageJsonPath;
	}

	function getDataProviders(packageJsonPath: string) {

		let dataProviders = dataPrividers.get(packageJsonPath);

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

			dataPrividers.set(packageJsonPath, dataProviders);
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
