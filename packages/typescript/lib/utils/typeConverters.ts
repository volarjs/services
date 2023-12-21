/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Helpers for converting FROM vscode types TO ts types
 */

import type { SymbolKind as _SymbolKind } from '@volar/language-service';
import * as PConst from '../protocol.const';
import type * as ts from 'typescript';

export namespace SymbolKind {
	export function fromProtocolScriptElementKind(kind: ts.ScriptElementKind) {
		switch (kind) {
			case PConst.Kind.module: return 2 satisfies typeof _SymbolKind.Module;
			case PConst.Kind.class: return 5 satisfies typeof _SymbolKind.Class;
			case PConst.Kind.enum: return 10 satisfies typeof _SymbolKind.Enum;
			case PConst.Kind.enumMember: return 22 satisfies typeof _SymbolKind.EnumMember;
			case PConst.Kind.interface: return 11 satisfies typeof _SymbolKind.Interface;
			case PConst.Kind.indexSignature: return 6 satisfies typeof _SymbolKind.Method;
			case PConst.Kind.callSignature: return 6 satisfies typeof _SymbolKind.Method;
			case PConst.Kind.method: return 6 satisfies typeof _SymbolKind.Method;
			case PConst.Kind.memberVariable: return 7 satisfies typeof _SymbolKind.Property;
			case PConst.Kind.memberGetAccessor: return 7 satisfies typeof _SymbolKind.Property;
			case PConst.Kind.memberSetAccessor: return 7 satisfies typeof _SymbolKind.Property;
			case PConst.Kind.variable: return 13 satisfies typeof _SymbolKind.Variable;
			case PConst.Kind.let: return 13 satisfies typeof _SymbolKind.Variable;
			case PConst.Kind.const: return 13 satisfies typeof _SymbolKind.Variable;
			case PConst.Kind.localVariable: return 13 satisfies typeof _SymbolKind.Variable;
			case PConst.Kind.alias: return 13 satisfies typeof _SymbolKind.Variable;
			case PConst.Kind.function: return 12 satisfies typeof _SymbolKind.Function;
			case PConst.Kind.localFunction: return 12 satisfies typeof _SymbolKind.Function;
			case PConst.Kind.constructSignature: return 9 satisfies typeof _SymbolKind.Constructor;
			case PConst.Kind.constructorImplementation: return 9 satisfies typeof _SymbolKind.Constructor;
			case PConst.Kind.typeParameter: return 26 satisfies typeof _SymbolKind.TypeParameter;
			case PConst.Kind.string: return 15 satisfies typeof _SymbolKind.String;
			default: return 13 satisfies typeof _SymbolKind.Variable;
		}
	}
}
