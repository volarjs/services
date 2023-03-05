import type { LanguageServicePlugin, LanguageServicePluginInstance } from '@volar/language-service';
import * as emmet from '@vscode/emmet-helper';
import * as html from 'vscode-html-languageservice';

export default (): LanguageServicePlugin => (context): LanguageServicePluginInstance => {

	const triggerCharacters = {
		// https://docs.emmet.io/abbreviations/syntax/
		triggerCharacters: '>+^*()#.[]$@-{}'.split(''),
	};
	if (!context) {
		return triggerCharacters;
	}

	const htmlLs = html.getLanguageService();
	const htmlDocuments = new WeakMap<html.TextDocument, [number, html.HTMLDocument]>();

	return {

		...triggerCharacters,

		complete: {

			isAdditional: true,

			async on(textDocument, position) {

				const syntax = emmet.getEmmetMode(textDocument.languageId === 'vue' ? 'html' : textDocument.languageId);
				if (!syntax)
					return;

				// fix https://github.com/vuejs/language-tools/issues/1329
				if (syntax === 'html') {
					const htmlDocument = getHtmlDocument(textDocument);
					const node = htmlDocument.findNodeAt(textDocument.offsetAt(position));
					if (node.tag) {
						let insideBlock = false;
						if (node.startTagEnd !== undefined && node.endTagStart !== undefined) {
							insideBlock = textDocument.offsetAt(position) >= node.startTagEnd && textDocument.offsetAt(position) <= node.endTagStart;
						}
						if (!insideBlock) {
							return;
						}
					}
				}

				// monkey fix https://github.com/johnsoncodehk/volar/issues/1105
				if (syntax === 'jsx')
					return;

				const emmetConfig = await getEmmetConfig(syntax);

				return emmet.doComplete(textDocument, position, syntax, emmetConfig);
			},
		},
	};

	async function getEmmetConfig(syntax: string): Promise<emmet.VSCodeEmmetConfig> {

		const emmetConfig: any = await context?.configurationHost?.getConfiguration<emmet.VSCodeEmmetConfig>('emmet') ?? {};
		const syntaxProfiles = Object.assign({}, emmetConfig['syntaxProfiles'] || {});
		const preferences = Object.assign({}, emmetConfig['preferences'] || {});

		// jsx, xml and xsl syntaxes need to have self closing tags unless otherwise configured by user
		if (syntax === 'jsx' || syntax === 'xml' || syntax === 'xsl') {
			syntaxProfiles[syntax] = syntaxProfiles[syntax] || {};
			if (typeof syntaxProfiles[syntax] === 'object'
				&& !syntaxProfiles[syntax].hasOwnProperty('self_closing_tag') // Old Emmet format
				&& !syntaxProfiles[syntax].hasOwnProperty('selfClosingStyle') // Emmet 2.0 format
			) {
				syntaxProfiles[syntax] = {
					...syntaxProfiles[syntax],
					selfClosingStyle: 'xml'
				};
			}
		}

		return {
			preferences,
			showExpandedAbbreviation: emmetConfig['showExpandedAbbreviation'],
			showAbbreviationSuggestions: emmetConfig['showAbbreviationSuggestions'],
			syntaxProfiles,
			variables: emmetConfig['variables'],
			excludeLanguages: emmetConfig['excludeLanguages'],
			showSuggestionsAsSnippets: emmetConfig['showSuggestionsAsSnippets']
		};
	}

	function getHtmlDocument(document: html.TextDocument) {

		const cache = htmlDocuments.get(document);
		if (cache) {
			const [cacheVersion, cacheDoc] = cache;
			if (cacheVersion === document.version) {
				return cacheDoc;
			}
		}

		const doc = htmlLs.parseHTMLDocument(document);
		htmlDocuments.set(document, [document.version, doc]);

		return doc;
	}
};
