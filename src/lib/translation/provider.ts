import {
  openaiTranslate,
  type OpenAiClientConfig,
} from "@/lib/openai/client";
import { grokTranslate, type XaiClientConfig } from "@/lib/xai/client";
import { TIJAR_LANGUAGE_NAMES } from "./languages";

/**
 * Provider-independent translation interface.
 * UI and routes depend on this shape only — swapping providers means
 * implementing this interface, not rewriting screens.
 */
export interface TranslationProvider {
  id: string;
  translate(input: { text: string; fromLanguage: string; toLanguage: string }): Promise<string>;
  /** Documented language names this provider accepts (exact strings). */
  supportedLanguages(): readonly string[];
}

/** ChatGPT — TIJAR's primary translation provider. */
export function createOpenAiProvider(config: OpenAiClientConfig = {}): TranslationProvider {
  return {
    id: "openai",
    translate: (input) => openaiTranslate(config, input),
    supportedLanguages: () => TIJAR_LANGUAGE_NAMES,
  };
}

/** Grok (xAI) — fallback translation provider. */
export function createGrokProvider(config: XaiClientConfig = {}): TranslationProvider {
  return {
    id: "grok",
    translate: (input) => grokTranslate(input, config),
    supportedLanguages: () => TIJAR_LANGUAGE_NAMES,
  };
}
