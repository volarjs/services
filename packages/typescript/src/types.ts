import type { ServiceContext } from '@volar/language-service';
import type * as ts from 'typescript/lib/tsserverlibrary';

export type SharedContext = ServiceContext & {
	typescript: {
		languageServiceHost: ts.LanguageServiceHost;
		languageService: ts.LanguageService;
	};
	ts: typeof import('typescript/lib/tsserverlibrary');
};
