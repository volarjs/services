/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from '@volar/language-service';
import type { HtmlNode, Node, Property, Rule, Stylesheet } from 'EmmetFlatNode';
import { allowedMimeTypesInScriptTag, getEmmetMode, getMappingForIncludedLanguages, isStyleSheet } from './util';

const hexColorRegex = /^#[\da-fA-F]{0,6}$/;

/**
 * Checks if given position is a valid location to expand emmet abbreviation.
 * Works only on html and css/less/scss syntax
 * @param document current Text Document
 * @param rootNode parsed document
 * @param currentNode current node in the parsed document
 * @param syntax syntax of the abbreviation
 * @param position position to validate
 * @param abbreviationRange The range of the abbreviation for which given position is being validated
 */
export async function isValidLocationForEmmetAbbreviation(context: vscode.LanguageServiceContext, document: vscode.TextDocument, rootNode: Node | undefined, currentNode: Node | undefined, syntax: string, offset: number, abbreviationRange: vscode.Range): Promise<boolean> {
	if (isStyleSheet(syntax)) {
		const stylesheet = <Stylesheet>rootNode;
		if (stylesheet && (stylesheet.comments || []).some(x => offset >= x.start && offset <= x.end)) {
			return false;
		}
		// Continue validation only if the file was parse-able and the currentNode has been found
		if (!currentNode) {
			return true;
		}

		// Get the abbreviation right now
		// Fixes https://github.com/microsoft/vscode/issues/74505
		// Stylesheet abbreviations starting with @ should bring up suggestions
		// even at outer-most level
		const abbreviation = document.getText(abbreviationRange);
		if (abbreviation.startsWith('@')) {
			return true;
		}

		// Fix for https://github.com/microsoft/vscode/issues/34162
		// Other than sass, stylus, we can make use of the terminator tokens to validate position
		if (syntax !== 'sass' && syntax !== 'stylus' && currentNode.type === 'property') {
			// Fix for upstream issue https://github.com/emmetio/css-parser/issues/3
			if (currentNode.parent
				&& currentNode.parent.type !== 'rule'
				&& currentNode.parent.type !== 'at-rule') {
				return false;
			}

			const propertyNode = <Property>currentNode;
			if (propertyNode.terminatorToken
				&& propertyNode.separator
				&& offset >= propertyNode.separatorToken.end
				&& offset <= propertyNode.terminatorToken.start
				&& !abbreviation.includes(':')) {
				return hexColorRegex.test(abbreviation) || abbreviation === '!';
			}
			if (!propertyNode.terminatorToken
				&& propertyNode.separator
				&& offset >= propertyNode.separatorToken.end
				&& !abbreviation.includes(':')) {
				return hexColorRegex.test(abbreviation) || abbreviation === '!';
			}
			if (hexColorRegex.test(abbreviation) || abbreviation === '!') {
				return false;
			}
		}

		// If current node is a rule or at-rule, then perform additional checks to ensure
		// emmet suggestions are not provided in the rule selector
		if (currentNode.type !== 'rule' && currentNode.type !== 'at-rule') {
			return true;
		}

		const currentCssNode = <Rule>currentNode;

		// Position is valid if it occurs after the `{` that marks beginning of rule contents
		if (offset > currentCssNode.contentStartToken.end) {
			return true;
		}

		// Workaround for https://github.com/microsoft/vscode/30188
		// The line above the rule selector is considered as part of the selector by the css-parser
		// But we should assume it is a valid location for css properties under the parent rule
		if (currentCssNode.parent
			&& (currentCssNode.parent.type === 'rule' || currentCssNode.parent.type === 'at-rule')
			&& currentCssNode.selectorToken) {
			const position = document.positionAt(offset);
			const tokenStartPos = document.positionAt(currentCssNode.selectorToken.start);
			const tokenEndPos = document.positionAt(currentCssNode.selectorToken.end);
			if (position.line !== tokenEndPos.line
				&& tokenStartPos.character === abbreviationRange.start.character
				&& tokenStartPos.line === abbreviationRange.start.line
			) {
				return true;
			}
		}

		return false;
	}

	const startAngle = '<';
	const endAngle = '>';
	const escape = '\\';
	const question = '?';
	const currentHtmlNode = <HtmlNode>currentNode;
	let start = 0;

	if (currentHtmlNode) {
		if (currentHtmlNode.name === 'script') {
			const typeAttribute = (currentHtmlNode.attributes || []).filter(x => x.name.toString() === 'type')[0];
			const typeValue = typeAttribute ? typeAttribute.value.toString() : '';

			if (allowedMimeTypesInScriptTag.includes(typeValue)) {
				return true;
			}

			const isScriptJavascriptType = !typeValue || typeValue === 'application/javascript' || typeValue === 'text/javascript';
			if (isScriptJavascriptType) {
				return !!await getSyntaxFromArgs(context, { language: 'javascript' });
			}
			return false;
		}

		// Fix for https://github.com/microsoft/vscode/issues/28829
		if (!currentHtmlNode.open || !currentHtmlNode.close ||
			!(currentHtmlNode.open.end <= offset && offset <= currentHtmlNode.close.start)) {
			return false;
		}

		// Fix for https://github.com/microsoft/vscode/issues/35128
		// Find the position up till where we will backtrack looking for unescaped < or >
		// to decide if current position is valid for emmet expansion
		start = currentHtmlNode.open.end;
		let lastChildBeforePosition = currentHtmlNode.firstChild;
		while (lastChildBeforePosition) {
			if (lastChildBeforePosition.end > offset) {
				break;
			}
			start = lastChildBeforePosition.end;
			lastChildBeforePosition = lastChildBeforePosition.nextSibling;
		}
	}
	const startPos = document.positionAt(start);
	let textToBackTrack = document.getText({ start: startPos, end: abbreviationRange.start });

	// Worse case scenario is when cursor is inside a big chunk of text which needs to backtracked
	// Backtrack only 500 offsets to ensure we dont waste time doing this
	if (textToBackTrack.length > 500) {
		textToBackTrack = textToBackTrack.substr(textToBackTrack.length - 500);
	}

	if (!textToBackTrack.trim()) {
		return true;
	}

	let valid = true;
	let foundSpace = false; // If < is found before finding whitespace, then its valid abbreviation. E.g.: <div|
	let i = textToBackTrack.length - 1;
	if (textToBackTrack[i] === startAngle) {
		return false;
	}

	while (i >= 0) {
		const char = textToBackTrack[i];
		i--;
		if (!foundSpace && /\s/.test(char)) {
			foundSpace = true;
			continue;
		}
		if (char === question && textToBackTrack[i] === startAngle) {
			i--;
			continue;
		}
		// Fix for https://github.com/microsoft/vscode/issues/55411
		// A space is not a valid character right after < in a tag name.
		if (/\s/.test(char) && textToBackTrack[i] === startAngle) {
			i--;
			continue;
		}
		if (char !== startAngle && char !== endAngle) {
			continue;
		}
		if (i >= 0 && textToBackTrack[i] === escape) {
			i--;
			continue;
		}
		if (char === endAngle) {
			if (i >= 0 && textToBackTrack[i] === '=') {
				continue; // False alarm of cases like =>
			} else {
				break;
			}
		}
		if (char === startAngle) {
			valid = !foundSpace;
			break;
		}
	}

	return valid;
}

export async function getSyntaxFromArgs(context: vscode.LanguageServiceContext, args: { [x: string]: string; }): Promise<string | undefined> {
	const mappedModes = await getMappingForIncludedLanguages(context);
	const language: string = args['language'];
	const parentMode: string = args['parentMode'];
	const excludedLanguages = await context.env.getConfiguration<string[]>?.('emmet.excludeLanguages') ?? [];
	if (excludedLanguages.includes(language)) {
		return;
	}

	let syntax = getEmmetMode(mappedModes[language] ?? language, mappedModes, excludedLanguages);
	if (!syntax) {
		syntax = getEmmetMode(mappedModes[parentMode] ?? parentMode, mappedModes, excludedLanguages);
	}

	return syntax;
}
