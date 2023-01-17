import type { LanguageServicePlugin } from '@volar/language-service';

console.warn('@volar-plugins/emmet: This plugin is not support on web yet.')

export = (): LanguageServicePlugin => () => ({});
