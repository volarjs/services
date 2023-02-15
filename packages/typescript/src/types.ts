import { LanguageServicePluginContext } from "@volar/language-service";

export type SharedContext = LanguageServicePluginContext & {
	typescript: NonNullable<LanguageServicePluginContext>;
};
