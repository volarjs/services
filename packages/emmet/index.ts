import type * as vscode from '@volar/language-service';
import type * as helper from '@vscode/emmet-helper';
import type { Node, Stylesheet } from 'EmmetFlatNode';
import { getRootNode } from './lib/parseDocument';
import { allowedMimeTypesInScriptTag, getEmbeddedCssNodeIfAny, getEmmetConfiguration, getEmmetHelper, getEmmetMode, getFlatNode, getHtmlFlatNode, isStyleSheet, parsePartialStylesheet } from './lib/util';
import { getSyntaxFromArgs, isValidLocationForEmmetAbbreviation } from './lib/abbreviationActions';

export function create({
	mappedLanguages = {},
}: {
	mappedLanguages?: Record<string, string>;
} = {}): vscode.LanguageServicePlugin {
	return {
		name: 'emmet',
		// https://docs.emmet.io/abbreviations/syntax/
		triggerCharacters: '>+^*()#.[]$@-{}'.split(''),
		// @ts-expect-error Need to update @volar/language-service
		create(context, languageService): vscode.LanguageServicePluginInstance {

			let lastCompletionType: string | undefined;

			return {

				isAdditionalCompletion: true,

				async provideCompletionItems(document, position, completionContext) {
					const completionResult = provideCompletionItemsInternal(document, position, completionContext);
					if (!completionResult) {
						lastCompletionType = undefined;
						return;
					}

					return completionResult.then(completionList => {
						if (!completionList || !completionList.items.length) {
							lastCompletionType = undefined;
							return completionList;
						}
						const item = completionList.items[0];
						const expandedText = item.documentation ? item.documentation.toString() : '';

						if (expandedText.startsWith('<')) {
							lastCompletionType = 'html';
						} else if (expandedText.indexOf(':') > 0 && expandedText.endsWith(';')) {
							lastCompletionType = 'css';
						} else {
							lastCompletionType = undefined;
						}
						return completionList;
					});
				},
			};

			async function provideCompletionItemsInternal(document: vscode.TextDocument, position: vscode.Position, completionContext: vscode.CompletionContext) {

				const emmetConfig: any = await context.env.getConfiguration?.<helper.VSCodeEmmetConfig>('emmet') ?? {};
				const excludedLanguages = emmetConfig['excludeLanguages'] ?? [];
				if (excludedLanguages.includes(document.languageId)) {
					return;
				}

				const isSyntaxMapped = mappedLanguages[document.languageId] ? true : false;
				const emmetMode = getEmmetMode(mappedLanguages[document.languageId] ?? document.languageId, mappedLanguages, excludedLanguages);
				if (!emmetMode
					|| emmetConfig['showExpandedAbbreviation'] === 'never'
					|| ((isSyntaxMapped || emmetMode === 'jsx') && emmetConfig['showExpandedAbbreviation'] !== 'always')) {
					return;
				}

				let syntax = emmetMode;

				let validateLocation = syntax === 'html' || syntax === 'jsx' || syntax === 'xml';
				let rootNode: Node | undefined;
				let currentNode: Node | undefined;

				// Don't show completions if there's a comment at the beginning of the line
				const lineRange: vscode.Range = {
					start: { line: position.line, character: 0 },
					end: position,
				};
				if (document.getText(lineRange).trimStart().startsWith('//')) {
					return;
				}

				const helper = getEmmetHelper();
				if (syntax === 'html') {
					if (completionContext.triggerKind === 3 satisfies typeof vscode.CompletionTriggerKind.TriggerForIncompleteCompletions) {
						switch (lastCompletionType) {
							case 'html':
								validateLocation = false;
								break;
							case 'css':
								validateLocation = false;
								syntax = 'css';
								break;
							default:
								break;
						}
					}
					if (validateLocation) {
						const positionOffset = document.offsetAt(position);
						const emmetRootNode = getRootNode(document, true);
						const foundNode = getHtmlFlatNode(document.getText(), emmetRootNode, positionOffset, false);
						if (foundNode) {
							if (foundNode.name === 'script') {
								const typeNode = foundNode.attributes.find(attr => attr.name.toString() === 'type');
								if (typeNode) {
									const typeAttrValue = typeNode.value.toString();
									if (typeAttrValue === 'application/javascript' || typeAttrValue === 'text/javascript') {
										if (!await getSyntaxFromArgs(context, { language: 'javascript' })) {
											return;
										} else {
											validateLocation = false;
										}
									}
									else if (allowedMimeTypesInScriptTag.includes(typeAttrValue)) {
										validateLocation = false;
									}
								} else {
									return;
								}
							}
							else if (foundNode.name === 'style') {
								syntax = 'css';
								validateLocation = false;
							} else {
								const styleNode = foundNode.attributes.find(attr => attr.name.toString() === 'style');
								if (styleNode && styleNode.value.start <= positionOffset && positionOffset <= styleNode.value.end) {
									syntax = 'css';
									validateLocation = false;
								}
							}
						}
					}
				}

				const expandOptions = isStyleSheet(syntax) ?
					{ lookAhead: false, syntax: 'stylesheet' } :
					{ lookAhead: true, syntax: 'markup' };
				const extractAbbreviationResults = helper.extractAbbreviation(document, position, expandOptions);
				if (!extractAbbreviationResults || !helper.isAbbreviationValid(syntax, extractAbbreviationResults.abbreviation)) {
					return;
				}

				const offset = document.offsetAt(position);
				if (isStyleSheet(document.languageId) && completionContext.triggerKind !== 3 satisfies typeof vscode.CompletionTriggerKind.TriggerForIncompleteCompletions) {
					validateLocation = true;
					const usePartialParsing = await context.env.getConfiguration<boolean>?.('emmet.optimizeStylesheetParsing') === true;
					rootNode = usePartialParsing && document.lineCount > 1000 ? parsePartialStylesheet(document, position) : <Stylesheet>getRootNode(document, true);
					if (!rootNode) {
						return;
					}
					currentNode = getFlatNode(rootNode, offset, true);
				}

				// Fix for https://github.com/microsoft/vscode/issues/107578
				// Validate location if syntax is of styleSheet type to ensure that location is valid for emmet abbreviation.
				// For an html document containing a <style> node, compute the embeddedCssNode and fetch the flattened node as currentNode.
				if (!isStyleSheet(document.languageId) && isStyleSheet(syntax) && completionContext.triggerKind !== 3 satisfies typeof vscode.CompletionTriggerKind.TriggerForIncompleteCompletions) {
					validateLocation = true;
					rootNode = getRootNode(document, true);
					if (!rootNode) {
						return;
					}
					const flatNode = getFlatNode(rootNode, offset, true);
					const embeddedCssNode = getEmbeddedCssNodeIfAny(document, flatNode, position);
					currentNode = getFlatNode(embeddedCssNode, offset, true);
				}

				if (validateLocation && !await isValidLocationForEmmetAbbreviation(context, document, rootNode, currentNode, syntax, offset, extractAbbreviationResults.abbreviationRange)) {
					return;
				}

				let isNoisePromise: Thenable<boolean> = Promise.resolve(false);

				// Fix for https://github.com/microsoft/vscode/issues/32647
				// Check for document symbols in js/ts/jsx/tsx and avoid triggering emmet for abbreviations of the form symbolName.sometext
				// Presence of > or * or + in the abbreviation denotes valid abbreviation that should trigger emmet
				if (!isStyleSheet(syntax) && (document.languageId === 'javascript' || document.languageId === 'javascriptreact' || document.languageId === 'typescript' || document.languageId === 'typescriptreact')) {
					const abbreviation: string = extractAbbreviationResults.abbreviation;
					// For the second condition, we don't want abbreviations that have [] characters but not ='s in them to expand
					// In turn, users must explicitly expand abbreviations of the form Component[attr1 attr2], but it means we don't try to expand a[i].
					if (abbreviation.startsWith('this.') || /\[[^\]=]*\]/.test(abbreviation)) {
						isNoisePromise = Promise.resolve(true);
					} else {
						const documentUri = context.decodeEmbeddedDocumentUri(document.uri)?.[0] ?? document.uri;
						isNoisePromise = languageService.findDocumentSymbols(documentUri).then(symbols => {
							return !!symbols && symbols.some(x => abbreviation === x.name || (abbreviation.startsWith(x.name + '.') && !/>|\*|\+/.test(abbreviation)));
						});
					}
				}

				return isNoisePromise.then(async (isNoise): Promise<vscode.CompletionList | undefined> => {
					if (isNoise) {
						return undefined;
					}

					const config = await getEmmetConfiguration(context, syntax);
					const result = helper.doComplete(document, position, syntax, config);

					// https://github.com/microsoft/vscode/issues/86941
					if (result && result.items && result.items.length === 1) {
						if (result.items[0].label === 'widows: ;') {
							return undefined;
						}
					}

					return result;
				});
			}
		},
	};
}
