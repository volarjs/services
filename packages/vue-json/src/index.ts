import type { LanguageServicePlugin } from '@volar/language-service';
import * as json from 'vscode-json-languageservice';
import * as vscode from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';

// modify of https://github.com/johnsoncodehk/volar/blob/master/plugins/json/src/index.ts
export = function (schemaUrls: Record<string, string>): LanguageServicePlugin {

	const jsonDocuments = new WeakMap<TextDocument, [number, json.JSONDocument]>();

	let jsonLs: json.LanguageService;

	return {

		setup(_context) {
			jsonLs = json.getLanguageService({
				schemaRequestService: _context.env.schemaRequestService,
				workspaceContext: _context.env.documentContext ? {
					resolveRelativePath: (ref, base) => _context.env.documentContext!.resolveReference(ref, base) ?? ref
				} : undefined,
			});
			const schemas = Object.entries(schemaUrls).map(entry =>
				({ fileMatch: [`*.customBlock_${entry[0]}_*.json*`], uri: new URL(entry[1], _context.env.rootUri.toString() + '/').toString() })
			)
			jsonLs.configure({ schemas })
		},

		complete: {

			// https://github.com/microsoft/vscode/blob/09850876e652688fb142e2e19fd00fd38c0bc4ba/extensions/json-language-features/server/src/jsonServer.ts#L150
			triggerCharacters: ['"', ':'],

			on(document, position, context) {
				return worker(document, async (jsonDocument) => {
					return await jsonLs.doComplete(document, position, jsonDocument);
				});
			},

			async resolve(item) {
				return await jsonLs.doResolve(item);
			},
		},

		validation: {
			onSyntactic(document) {
				return worker(document, async (jsonDocument) => {
					return await jsonLs.doValidation(
						document,
						jsonDocument,
					) as vscode.Diagnostic[];
				});
			},
		},

		doHover(document, position) {
			return worker(document, async (jsonDocument) => {
				return await jsonLs.doHover(document, position, jsonDocument);
			});
		},
	};

	function worker<T>(document: TextDocument, callback: (jsonDocument: json.JSONDocument) => T) {

		const jsonDocument = getJsonDocument(document);
		if (!jsonDocument)
			return;

		return callback(jsonDocument);
	}

	function getJsonDocument(textDocument: TextDocument) {

		if (textDocument.languageId !== 'json' && textDocument.languageId !== 'jsonc')
			return;

		const cache = jsonDocuments.get(textDocument);
		if (cache) {
			const [cacheVersion, cacheDoc] = cache;
			if (cacheVersion === textDocument.version) {
				return cacheDoc;
			}
		}

		const doc = jsonLs.parseJSONDocument(textDocument);
		jsonDocuments.set(textDocument, [textDocument.version, doc]);

		return doc;
	}
}
