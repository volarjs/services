import { SharedContext } from '../types';
import type * as ts from 'typescript/lib/tsserverlibrary';
import type * as vscode from '@volar/language-service';
import { safeCall } from '../shared';

export function register(ctx: SharedContext) {
	const { ts } = ctx;

	return (uri: string, position: vscode.Position, context?: vscode.SignatureHelpContext): vscode.SignatureHelp | undefined => {
		const document = ctx.getTextDocument(uri);
		if (!document) return;

		const options: ts.SignatureHelpItemsOptions = {};
		if (context?.triggerKind === 1 satisfies typeof vscode.SignatureHelpTriggerKind.Invoked) {
			options.triggerReason = {
				kind: 'invoked'
			};
		}
		else if (context?.triggerKind === 2 satisfies typeof vscode.SignatureHelpTriggerKind.TriggerCharacter) {
			options.triggerReason = {
				kind: 'characterTyped',
				triggerCharacter: context.triggerCharacter as ts.SignatureHelpTriggerCharacter,
			};
		}
		else if (context?.triggerKind === 3 satisfies typeof vscode.SignatureHelpTriggerKind.ContentChange) {
			options.triggerReason = {
				kind: 'retrigger',
				triggerCharacter: context.triggerCharacter as ts.SignatureHelpRetriggerCharacter,
			};
		}

		const fileName = ctx.env.uriToFileName(document.uri);
		const offset = document.offsetAt(position);
		const helpItems = safeCall(() => ctx.typescript.languageService.getSignatureHelpItems(fileName, offset, options));
		if (!helpItems) return;

		return {
			activeSignature: helpItems.selectedItemIndex,
			activeParameter: helpItems.argumentIndex,
			signatures: helpItems.items.map(item => {
				const signature: vscode.SignatureInformation = {
					label: '',
					documentation: undefined,
					parameters: []
				};
				signature.label += ts.displayPartsToString(item.prefixDisplayParts);
				item.parameters.forEach((p, i, a) => {
					const label = ts.displayPartsToString(p.displayParts);
					const parameter: vscode.ParameterInformation = {
						label,
						documentation: ts.displayPartsToString(p.documentation)
					};
					signature.label += label;
					signature.parameters!.push(parameter);
					if (i < a.length - 1) {
						signature.label += ts.displayPartsToString(item.separatorDisplayParts);
					}
				});
				signature.label += ts.displayPartsToString(item.suffixDisplayParts);
				return signature;
			}),
		};
	};
}
