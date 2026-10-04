import type { LanguageServiceContext } from '@volar/language-service';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { unifiedDefaults } from '../lib/configs/getUnifiedConfig';

/**
 * Mirrors the two shapes a host can hand back through
 * `LanguageServiceEnvironment.getConfiguration`:
 *
 * - `vscode`: VS Code answers `workspace/configuration` with the fully resolved
 *   section, registered defaults included. There is no way to tell an unset
 *   setting from one explicitly set to its default.
 * - `partial`: `@volar/kit` only returns the keys present in the flat settings
 *   object, so an unset key stays `undefined`.
 */
export type HostShape = 'vscode' | 'partial';

/**
 * Registered defaults of the language-specific sections that have no unified
 * counterpart, needed to make the resolved shape realistic for those keys.
 */
const languageOnlyDefaults: Record<string, any> = {
	'preferences.renameShorthandProperties': true,
};

/** `'js/ts.format.semicolons'` -> `{ section: 'js/ts', path: ['format', 'semicolons'] }` */
function parseSettingKey(key: string) {
	const index = key.indexOf('.');
	return index === -1
		? { section: key, path: [] as string[] }
		: { section: key.substring(0, index), path: key.substring(index + 1).split('.') };
}

function setIn(object: Record<string, any>, path: string[], value: unknown) {
	let current = object;
	for (let i = 0; i < path.length - 1; i++) {
		current = current[path[i]] ??= {};
	}
	current[path[path.length - 1]] = value;
}

function deepMerge(defaults: any, explicit: any): any {
	if (typeof defaults !== 'object' || defaults === null || Array.isArray(defaults)) {
		return explicit === undefined ? defaults : explicit;
	}
	const result: Record<string, any> = { ...explicit };
	for (const key in defaults) {
		result[key] = deepMerge(defaults[key], explicit?.[key]);
	}
	return result;
}

function toSections(settings: Record<string, any>): Map<string, Record<string, any>> {
	const sections = new Map<string, Record<string, any>>();
	for (const key in settings) {
		const { section, path } = parseSettingKey(key);
		if (path.length) {
			const value = sections.get(section) ?? {};
			setIn(value, path, settings[key]);
			sections.set(section, value);
		}
		else {
			sections.set(section, settings[key]);
		}
	}
	return sections;
}

export function createContext(settings: Record<string, any>, shape: HostShape = 'vscode'): LanguageServiceContext {
	const sections = toSections(settings);
	return {
		env: {
			getConfiguration: (section: string) => {
				const explicit = sections.get(section);
				if (shape === 'partial') {
					return explicit;
				}
				if (section === 'js/ts') {
					return deepMerge(unifiedDefaults, explicit);
				}
				const resolved = { ...explicit };
				for (const key in languageOnlyDefaults) {
					const { path } = parseSettingKey(key);
					let current: any = resolved;
					let found = true;
					for (const prop of path) {
						if (typeof current !== 'object' || current === null || !(prop in current)) {
							found = false;
							break;
						}
						current = current[prop];
					}
					if (!found) {
						setIn(resolved, path, languageOnlyDefaults[key]);
					}
				}
				return Object.keys(resolved).length ? resolved : undefined;
			},
		},
	} as any;
}

export const document = { languageId: 'typescript' } as TextDocument;
