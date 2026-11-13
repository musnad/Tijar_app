import { z } from "zod";

import {
  isOpenAiConfigured,
  openaiTranslate,
  OpenAiError,
  type OpenAiClientConfig,
} from "@/lib/openai/client";
import { grokTranslate, isXaiConfigured, XaiError, type XaiClientConfig } from "@/lib/xai/client";

import { getCachedTranslation, setCachedTranslation, translationCacheKey } from "./cache";
import { isHausaEnglishPair, polishHausaEnglish } from "./hausa-english";
import { isTijarLanguage } from "./languages";
import { isTijarTranslateConfigured, tijarWorkerTranslate } from "./tijar-worker";
import { checkRateLimit } from "@/lib/api/rate-limit";

export const translateRequestSchema = z.object({
  text: z.string().trim().min(1, "Text is required.").max(1000, "Text is too long (max 1000 characters)."),
  fromLanguage: z.string().trim().min(1).max(40),
  toLanguage: z.string().trim().min(1).max(40),
});

export type TranslateEngine = "cache" | "tijar" | "xai" | "openai";

export type TranslateResult =
  | {
      ok: true;
      translatedText: string;
      cached: boolean;
      fromLanguage: string;
      toLanguage: string;
      engine: TranslateEngine;
    }
  | { ok: false; status: number; code: string; message: string };

export type TranslateDeps = {
  openAiConfig?: OpenAiClientConfig | undefined;
  xaiConfig?: XaiClientConfig | undefined;
  rateLimitKey?: string | undefined;
  rateLimit?: number | undefined;
};

export const translateBatchSchema = z.object({
  texts: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
  fromLanguage: z.string().trim().min(1).max(40),
  toLanguage: z.string().trim().min(1).max(40),
});

/** Batch translation for UI strings / listing fields. Same rules as single. */
export async function translateBatch(
  rawInput: unknown,
  deps: TranslateDeps = {},
): Promise<{ ok: true; translations: string[] } | { ok: false; status: number; code: string; message: string }> {
  const parsed = translateBatchSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, status: 400, code: "VALIDATION", message: parsed.error.errors[0]?.message ?? "Invalid batch." };
  }
  const translations: string[] = [];
  for (const text of parsed.data.texts) {
    const result = await translateText(
      { text, fromLanguage: parsed.data.fromLanguage, toLanguage: parsed.data.toLanguage },
      deps,
    );
    if (!result.ok) return result;
    translations.push(result.translatedText);
  }
  return { ok: true, translations };
}

/**
 * Orchestrates validation -> language checks -> cache -> rate limit ->
 * Optional TIJAR worker (Hausa↔English first), then Grok, then ChatGPT.
 * Original text is never mutated or logged.
 */
export async function translateText(
  rawInput: unknown,
  deps: TranslateDeps = {},
): Promise<TranslateResult> {
  const parsed = translateRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      code: "VALIDATION",
      message: parsed.error.errors[0]?.message ?? "Invalid translation request.",
    };
  }
  const { text, fromLanguage, toLanguage } = parsed.data;

  if (fromLanguage === toLanguage) {
    return { ok: false, status: 400, code: "SAME_LANGUAGE", message: "Source and target language are the same." };
  }
  if (!isTijarLanguage(fromLanguage) || !isTijarLanguage(toLanguage)) {
    const bad = isTijarLanguage(fromLanguage) ? toLanguage : fromLanguage;
    return {
      ok: false,
      status: 400,
      code: "UNSUPPORTED_LANGUAGE",
      message: `TIJAR does not translate "${bad}" yet.`,
    };
  }

  const cacheKey = translationCacheKey(text, fromLanguage, toLanguage);
  const cached = getCachedTranslation(cacheKey);
  if (cached !== null) {
    return { ok: true, translatedText: cached, cached: true, fromLanguage, toLanguage, engine: "cache" };
  }

  if (deps.rateLimitKey) {
    const limit = checkRateLimit(deps.rateLimitKey, deps.rateLimit ?? 20);
    if (!limit.allowed) {
      return {
        ok: false,
        status: 429,
        code: "RATE_LIMITED",
        message: `Too many translation requests. Try again in ${limit.retryAfterSeconds}s.`,
      };
    }
  }

  const errors: Array<{ status: number; code: string; message: string }> = [];

  const finishOk = (translated: string, engine: TranslateEngine): TranslateResult => {
    const polished = isHausaEnglishPair(fromLanguage, toLanguage)
      ? polishHausaEnglish(text, translated, fromLanguage, toLanguage)
      : translated.replace(/^["']|["']$/g, "").trim();
    setCachedTranslation(cacheKey, polished);
    return { ok: true, translatedText: polished, cached: false, fromLanguage, toLanguage, engine };
  };

  if (isTijarTranslateConfigured()) {
    try {
      const translated = await tijarWorkerTranslate({ text, fromLanguage, toLanguage });
      return finishOk(translated, "tijar");
    } catch {
      errors.push({ status: 502, code: "WORKER_ERROR", message: "TIJAR translate worker failed." });
    }
  }

  // Grok — Hausa, Igbo, Yoruba, Swahili, Pidgin, Fulfulde, …
  if (deps.xaiConfig?.apiKey || (deps.xaiConfig === undefined && isXaiConfigured())) {
    try {
      const translated = await grokTranslate({ text, fromLanguage, toLanguage }, deps.xaiConfig ?? {});
      return finishOk(translated, "xai");
    } catch (err) {
      if (err instanceof XaiError) errors.push({ status: err.status, code: err.code, message: err.message });
      else errors.push({ status: 502, code: "PROVIDER_ERROR", message: "Grok translation failed." });
    }
  }

  // 2) ChatGPT fallback
  if (deps.openAiConfig?.apiKey || (deps.openAiConfig === undefined && isOpenAiConfigured())) {
    try {
      const translated = await openaiTranslate(deps.openAiConfig ?? {}, {
        text,
        fromLanguage,
        toLanguage,
      });
      return finishOk(translated, "openai");
    } catch (err) {
      if (err instanceof OpenAiError) errors.push({ status: err.status, code: err.code, message: err.message });
      else errors.push({ status: 502, code: "PROVIDER_ERROR", message: "ChatGPT translation failed." });
    }
  }

  if (errors.length === 0) {
    return {
      ok: false,
      status: 503,
      code: "NOT_CONFIGURED",
      message: "Translation is not configured on this server (missing OPENAI_API_KEY or XAI_API_KEY).",
    };
  }
  // Prefer a non-rate-limit error when both providers were tried.
  const preferred = errors.find((e) => e.code !== "QUOTA_EXCEEDED" && e.code !== "RATE_LIMITED") ?? errors[0]!;
  return { ok: false, status: preferred.status, code: preferred.code, message: preferred.message };
}
