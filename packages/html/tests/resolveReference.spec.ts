import { describe, expect, test } from 'vitest';
import { URI } from 'vscode-uri';
import { resolveReference } from '..';

describe('HTML Document Context', () => {

	test('resolveReference', () => {
		const docURI = URI.parse('file:///users/test/folder/test.html');
		const rootFolders = [URI.parse('file:///users/test/')];

		expect(resolveReference('/', docURI, rootFolders)).toBe('file:///users/test/');
		expect(resolveReference('/message.html', docURI, rootFolders)).toBe('file:///users/test/message.html');
		expect(resolveReference('message.html', docURI, rootFolders)).toBe('file:///users/test/folder/message.html');
		expect(resolveReference('message.html', URI.parse('file:///users/test/'), rootFolders)).toBe('file:///users/test/message.html');
	});
});
