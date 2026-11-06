import {
  OPENAI_LANGUAGES,
  openaiTranslate,
  type OpenAiClientConfig,
} from "@/lib/openai/client";
import { grokTranslate, type XaiClientConfig } from "@/lib/xai/client";
import { TIJAR_LANGUAGE_NAMES } from "@/lib/translation/languages";

export interface TranslationProvider {
  id: string;
  translate(input: { text: string; fromLanguage: string; toLanguage: string }): Promise<string>;
  supportedLanguages(): readonly string[];
}

export function createGrokProvider(config: XaiClientConfig = {}): TranslationProvider {
  return {
    id: "grok",
    translate: (input) => grokTranslate(input, config),
    supportedLanguages: () => TIJAR_LANGUAGE_NAMES,
  };
}

export function createOpenAiProvider(config: OpenAiClientConfig = {}): TranslationProvider {
  return {
    id: "openai",
    translate: (input) => openaiTranslate(config, input),
    supportedLanguages: () => OPENAI_LANGUAGES,
  };
}
