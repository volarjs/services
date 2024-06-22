import type * as vscode from '@volar/language-service';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { safeCall } from '../shared';
import type { SharedContext } from './types';
import type { URI } from 'vscode-uri';

export function register(ts: typeof import('typescript'), ctx: SharedContext) {
	return (uri: URI, document: TextDocument, range: vscode.Range, legend: vscode.SemanticTokensLegend) => {
		const fileName = ctx.uriToFileName(uri);
		const start = range ? document.offsetAt(range.start) : 0;
		const length = range ? (document.offsetAt(range.end) - start) : document.getText().length;

		if (ctx.language.typescript?.languageServiceHost.getCancellationToken?.().isCancellationRequested()) {
			return;
		}
		const response = safeCall(() => ctx.languageService.getEncodedSemanticClassifications(fileName, { start, length }, ts.SemanticClassificationFormat.TwentyTwenty));
		if (!response) {
			return;
		}

		let tokenModifiersTable: number[] = [];
		tokenModifiersTable[TokenModifier.async] = 1 << legend.tokenModifiers.indexOf('async');
		tokenModifiersTable[TokenModifier.declaration] = 1 << legend.tokenModifiers.indexOf('declaration');
		tokenModifiersTable[TokenModifier.readonly] = 1 << legend.tokenModifiers.indexOf('readonly');
		tokenModifiersTable[TokenModifier.static] = 1 << legend.tokenModifiers.indexOf('static');
		tokenModifiersTable[TokenModifier.local] = 1 << legend.tokenModifiers.indexOf('local');
		tokenModifiersTable[TokenModifier.defaultLibrary] = 1 << legend.tokenModifiers.indexOf('defaultLibrary');
		tokenModifiersTable = tokenModifiersTable.map(mod => Math.max(mod, 0));

		const tokenSpan = response.spans;
		const tokens: [number, number, number, number, number][] = [];
		let i = 0;
		while (i < tokenSpan.length) {
			const offset = tokenSpan[i++];
			const length = tokenSpan[i++];
			const tsClassification = tokenSpan[i++];

			const tokenType = getTokenTypeFromClassification(tsClassification);
			if (tokenType === undefined) {
				continue;
			}

			const tokenModifiers = getTokenModifierFromClassification(tsClassification);

			// we can use the document's range conversion methods because the result is at the same version as the document
			const startPos = document.positionAt(offset);
			const endPos = document.positionAt(offset + length);
			const serverToken = tsTokenTypeToServerTokenType(tokenType);
			if (serverToken === undefined) {
				continue;
			}
			const serverTokenModifiers = tsTokenModifierToServerTokenModifier(tokenModifiers);

			for (let line = startPos.line; line <= endPos.line; line++) {
				const startCharacter = (line === startPos.line ? startPos.character : 0);
				const endCharacter = (line === endPos.line ? endPos.character : docLineLength(document, line));
				tokens.push([line, startCharacter, endCharacter - startCharacter, serverToken, serverTokenModifiers]);
			}
		}
		return tokens;

		function tsTokenTypeToServerTokenType(tokenType: number) {
			return legend.tokenTypes.indexOf(tokenTypes[tokenType]);
		}

		function tsTokenModifierToServerTokenModifier(input: number) {
			let m = 0;
			let i = 0;
			while (input) {
				if (input & 1) {
					m |= tokenModifiersTable[i];
				}
				input = input >> 1;
				i++;
			}
			return m;
		}
	};
}

function docLineLength(document: TextDocument, line: number) {
	const currentLineOffset = document.offsetAt({ line, character: 0 });
	const nextLineOffset = document.offsetAt({ line: line + 1, character: 0 });
	return nextLineOffset - currentLineOffset;
}

// typescript encodes type and modifiers in the classification:
// TSClassification = (TokenType + 1) << 8 + TokenModifier

declare const enum TokenType {
	class = 0,
	enum = 1,
	interface = 2,
	namespace = 3,
	typeParameter = 4,
	type = 5,
	parameter = 6,
	variable = 7,
	enumMember = 8,
	property = 9,
	function = 10,
	method = 11,
	_ = 12
}
declare const enum TokenModifier {
	declaration = 0,
	static = 1,
	async = 2,
	readonly = 3,
	defaultLibrary = 4,
	local = 5,
	_ = 6
}
declare const enum TokenEncodingConsts {
	typeOffset = 8,
	modifierMask = 255
}

function getTokenTypeFromClassification(tsClassification: number): number | undefined {
	if (tsClassification > TokenEncodingConsts.modifierMask) {
		return (tsClassification >> TokenEncodingConsts.typeOffset) - 1;
	}
	return undefined;
}

function getTokenModifierFromClassification(tsClassification: number) {
	return tsClassification & TokenEncodingConsts.modifierMask;
}

const tokenTypes: string[] = [];
tokenTypes[TokenType.class] = 'class';
tokenTypes[TokenType.enum] = 'enum';
tokenTypes[TokenType.interface] = 'interface';
tokenTypes[TokenType.namespace] = 'namespace';
tokenTypes[TokenType.typeParameter] = 'typeParameter';
tokenTypes[TokenType.type] = 'type';
tokenTypes[TokenType.parameter] = 'parameter';
tokenTypes[TokenType.variable] = 'variable';
tokenTypes[TokenType.enumMember] = 'enumMember';
tokenTypes[TokenType.property] = 'property';
tokenTypes[TokenType.function] = 'function';
tokenTypes[TokenType.method] = 'method';

const tokenModifiers: string[] = [];
tokenModifiers[TokenModifier.async] = 'async';
tokenModifiers[TokenModifier.declaration] = 'declaration';
tokenModifiers[TokenModifier.readonly] = 'readonly';
tokenModifiers[TokenModifier.static] = 'static';
tokenModifiers[TokenModifier.local] = 'local';
tokenModifiers[TokenModifier.defaultLibrary] = 'defaultLibrary';

// mapping for the original ExperimentalProtocol.ClassificationType from TypeScript (only used when plugin is not available)
const tokenTypeMap: number[] = [];
tokenTypeMap[ExperimentalProtocol.ClassificationType.className] = TokenType.class;
tokenTypeMap[ExperimentalProtocol.ClassificationType.enumName] = TokenType.enum;
tokenTypeMap[ExperimentalProtocol.ClassificationType.interfaceName] = TokenType.interface;
tokenTypeMap[ExperimentalProtocol.ClassificationType.moduleName] = TokenType.namespace;
tokenTypeMap[ExperimentalProtocol.ClassificationType.typeParameterName] = TokenType.typeParameter;
tokenTypeMap[ExperimentalProtocol.ClassificationType.typeAliasName] = TokenType.type;
tokenTypeMap[ExperimentalProtocol.ClassificationType.parameterName] = TokenType.parameter;


namespace ExperimentalProtocol {

	export const enum ClassificationType {
		comment = 1,
		identifier = 2,
		keyword = 3,
		numericLiteral = 4,
		operator = 5,
		stringLiteral = 6,
		regularExpressionLiteral = 7,
		whiteSpace = 8,
		text = 9,
		punctuation = 10,
		className = 11,
		enumName = 12,
		interfaceName = 13,
		moduleName = 14,
		typeParameterName = 15,
		typeAliasName = 16,
		parameterName = 17,
		docCommentTagName = 18,
		jsxOpenTagName = 19,
		jsxCloseTagName = 20,
		jsxSelfClosingTagName = 21,
		jsxAttribute = 22,
		jsxText = 23,
		jsxAttributeStringLiteralValue = 24,
		bigintLiteral = 25,
	}
}
