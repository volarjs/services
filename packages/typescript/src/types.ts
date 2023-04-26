import { ServiceContext } from "@volar/language-service";

export type SharedContext = ServiceContext & {
	typescript: NonNullable<ServiceContext['typescript']>;
	ts: typeof import('typescript/lib/tsserverlibrary');
};
