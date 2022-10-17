import type { LanguageServicePlugin } from '@volar/language-service';
import * as json from 'vscode-json-languageservice';
import * as vscode from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';

// modify of https://github.com/johnsoncodehk/volar/blob/master/plugins/json/src/index.ts
export = function (schemaUrls: Record<string, string>): LanguageServicePlugin {

	const jsonDocuments = new WeakMap<TextDocument, [number, TextDocument, json.JSONDocument]>();

	let jsonLs: json.LanguageService;

	return {

		setup(_context) {
			jsonLs = json.getLanguageService({
				schemaRequestService: _context.env.schemaRequestService,
				workspaceContext: _context.env.documentContext ? {
					resolveRelativePath: (ref, base) => _context.env.documentContext!.resolveReference(ref, base) ?? ref
				} : undefined,
			});
		},

		complete: {

			// https://github.com/microsoft/vscode/blob/09850876e652688fb142e2e19fd00fd38c0bc4ba/extensions/json-language-features/server/src/jsonServer.ts#L150
			triggerCharacters: ['"', ':'],

			on(document, position, context) {
				return worker(document, async (document, jsonDocument) => {
					return await jsonLs.doComplete(document, position, jsonDocument);
				});
			},

			async resolve(item) {
				return await jsonLs.doResolve(item);
			},
		},

		validation: {
			onSyntactic(document) {
				return worker(document, async (document, jsonDocument) => {

					const documentLanguageSettings = undefined; // await getSettings(); // TODO

					return await jsonLs.doValidation(
						document,
						jsonDocument,
						documentLanguageSettings,
						undefined, // TODO
					) as vscode.Diagnostic[];
				});
			},
		},

		doHover(document, position) {
			return worker(document, async (document, jsonDocument) => {
				return await jsonLs.doHover(document, position, jsonDocument);
			});
		},
	};

	function worker<T>(document: TextDocument, callback: (doc: TextDocument, jsonDocument: json.JSONDocument) => T) {

		const jsonDocument = getJsonDocument(document);
		if (!jsonDocument)
			return;

		return callback(jsonDocument[0], jsonDocument[1]);
	}

	function getJsonDocument(textDocument: TextDocument) {

		if (textDocument.languageId !== 'json' && textDocument.languageId !== 'jsonc')
			return;

		const match = textDocument.uri.match(/^(.*)\.customBlock_([^_]+)_(\d+)\.([^.]+)$/);
		if (!match)
			return;

		const blockType = match[2];
		const schemaUrl = schemaUrls[blockType];
		if (!schemaUrl)
			return;

		const cache = jsonDocuments.get(textDocument);
		if (cache) {
			const [cacheVersion, cacheDoc, cacheJsonDoc] = cache;
			if (cacheVersion === textDocument.version) {
				return [cacheDoc, cacheJsonDoc] as const;
			}
		}

		const insertIndex = textDocument.getText().lastIndexOf('}');
		const modifyDoc = insertIndex >= 0 ? TextDocument.create(
			textDocument.uri,
			textDocument.languageId,
			textDocument.version,
			textDocument.getText().substring(0, insertIndex) + `,"$schema":"${schemaUrl}"` + textDocument.getText().substring(insertIndex),
		) : textDocument;
		const jsonDoc = jsonLs.parseJSONDocument(modifyDoc);

		jsonDocuments.set(textDocument, [textDocument.version, modifyDoc, jsonDoc]);

		return [modifyDoc, jsonDoc] as const;
	}
}
