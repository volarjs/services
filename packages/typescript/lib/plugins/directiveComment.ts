import type * as vscode from '@volar/language-service';
import * as nls from 'vscode-nls';
import { isTsDocument } from '../shared';

const localize = nls.loadMessageBundle(); // TODO: not working

interface Directive {
	readonly value: string;
	readonly description: string;
}

const directives: Directive[] = [
	{
		value: '@ts-check',
		description: localize(
			'ts-check',
			"Enables semantic checking in a JavaScript file. Must be at the top of a file.")
	}, {
		value: '@ts-nocheck',
		description: localize(
			'ts-nocheck',
			"Disables semantic checking in a JavaScript file. Must be at the top of a file.")
	}, {
		value: '@ts-ignore',
		description: localize(
			'ts-ignore',
			"Suppresses @ts-check errors on the next line of a file.")
	}, {
		value: '@ts-expect-error',
		description: localize(
			'ts-expect-error',
			"Suppresses @ts-check errors on the next line of a file, expecting at least one to exist.")
	}
];

export function create(): vscode.LanguageServicePlugin {
	return {
		name: 'typescript-directive-comment',
		capabilities: {
			completionProvider: {
				triggerCharacters: ['@'],
			},
		},
		create(): vscode.LanguageServicePluginInstance {

			return {

				provideCompletionItems(document, position) {

					if (!isTsDocument(document)) {
						return;
					}

					const prefix = document.getText({
						start: { line: position.line, character: 0 },
						end: position,
					});
					const match = prefix.match(/^\s*\/\/+\s?(@[a-zA-Z\-]*)?$/);
					if (match) {

						const items = directives.map(directive => {

							const item: vscode.CompletionItem = { label: directive.value };
							item.insertTextFormat = 2 satisfies typeof vscode.InsertTextFormat.Snippet;
							item.detail = directive.description;
							const range: vscode.Range = {
								start: {
									line: position.line,
									character: Math.max(0, position.character - (match[1] ? match[1].length : 0)),
								},
								end: position,
							};
							item.textEdit = {
								range,
								newText: directive.value,
							};

							return item;
						});

						return {
							isIncomplete: false,
							items,
						};
					}
				},
			};
		},
	};
}
