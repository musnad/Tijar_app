/**
 * OpenAI (ChatGPT) server-side client for TIJAR AI:
 *   - Text translation  → Chat Completions (gpt-4o-mini)
 *   - Speech-to-text    → Audio transcriptions (whisper-1)
 *   - Text-to-speech    → Audio speech (tts-1)
 *
 * API key is server-only (OPENAI_API_KEY). Never prefix with VITE_.
 * Never log prompts, transcripts, or the secret.
 */

import { sanitizeSecret } from "@/lib/secrets";
import {
  OPENAI_LANGUAGES,
  isOpenAiLanguage,
  type OpenAiLanguage,
} from "@/lib/openai/languages";
import { readEnvString } from "@/lib/supabase/runtime-env";
import { tijarTranslateSystemPrompt } from "@/lib/translation/hausa-english";

export { OPENAI_LANGUAGES, isOpenAiLanguage, type OpenAiLanguage };

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TIMEOUT_MS = 45_000;
const USER_AGENT = "TIJAR/1.0 (+https://tijar-two.vercel.app)";

const API_KEY_ENV_NAMES = ["OPENAI_API_KEY", "CHATGPT_API_KEY"] as const;
const BASE_URL_ENV_NAMES = ["OPENAI_BASE_URL"] as const;

/** Whisper / TTS BCP-ish language hints. */
const WHISPER_LANG: Partial<Record<OpenAiLanguage, string>> = {
  English: "en",
  Yoruba: "yo",
  Hausa: "ha",
  Igbo: "ig",
  Swahili: "sw",
  "Nigerian Pidgin": "en",
  Arabic: "ar",
  Hindi: "hi",
  Chinese: "zh",
  Fulfulde: "ff",
};

export type OpenAiClientConfig = {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  chatModel?: string;
  ttsModel?: string;
  sttModel?: string;
};

export type OpenAiErrorCode =
  | "NOT_CONFIGURED"
  | "INVALID_CREDENTIALS"
  | "QUOTA_EXCEEDED"
  | "BAD_REQUEST"
  | "TIMEOUT"
  | "NETWORK"
  | "PROVIDER_ERROR"
  | "UNSUPPORTED_LANGUAGE";

export class OpenAiError extends Error {
  code: OpenAiErrorCode;
  status: number;
  providerStatus?: number;
  constructor(code: OpenAiErrorCode, message: string, status = 502, providerStatus?: number) {
    super(message);
    this.name = "OpenAiError";
    this.code = code;
    this.status = status;
    if (providerStatus !== undefined) this.providerStatus = providerStatus;
  }
}

function readDynamicEnv(
  names: readonly string[],
  override?: Record<string, string | undefined>,
): string | undefined {
  for (const name of names) {
    if (override) {
      const v = override[name];
      if (typeof v === "string" && v.trim()) return v;
      continue;
    }
    const fromReader = readEnvString(name);
    if (fromReader) return fromReader;
    if (typeof process !== "undefined" && process.env) {
      const fromProcess = process.env[name];
      if (typeof fromProcess === "string" && fromProcess.trim()) return fromProcess;
    }
  }
  return undefined;
}

export function readOpenAiConfig(env?: Record<string, string | undefined>): {
  apiKey: string | null;
  baseUrl: string;
} {
  const apiKey = sanitizeSecret(readDynamicEnv(API_KEY_ENV_NAMES, env));
  const baseUrl = (
    sanitizeSecret(readDynamicEnv(BASE_URL_ENV_NAMES, env)) || DEFAULT_BASE_URL
  ).replace(/\/$/, "");
  return { apiKey, baseUrl };
}

export function openaiKeyFingerprint(apiKey: string | null): {
  present: boolean;
  formatOk: boolean;
  length: number;
  hint: string | null;
} {
  if (!apiKey) return { present: false, formatOk: false, length: 0, hint: null };
  const formatOk = apiKey.startsWith("sk-") && apiKey.length >= 20;
  const hint =
    apiKey.length >= 8 ? `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}` : `${apiKey.slice(0, 2)}…`;
  return { present: true, formatOk, length: apiKey.length, hint };
}

function resolveConfig(config: OpenAiClientConfig = {}): {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  fetchImpl: typeof fetch;
  chatModel: string;
  ttsModel: string;
  sttModel: string;
} {
  const env = readOpenAiConfig();
  const rawKey = config.apiKey !== undefined ? config.apiKey : env.apiKey;
  const apiKey = rawKey?.trim() ? rawKey : undefined;
  if (!apiKey) {
    throw new OpenAiError(
      "NOT_CONFIGURED",
      "AI is not configured on this server (missing OPENAI_API_KEY).",
      503,
    );
  }
  return {
    apiKey,
    baseUrl: (config.baseUrl || env.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, ""),
    timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    fetchImpl: config.fetchImpl ?? fetch,
    chatModel: config.chatModel ?? "gpt-4o-mini",
    ttsModel: config.ttsModel ?? "tts-1",
    sttModel: config.sttModel ?? "whisper-1",
  };
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new OpenAiError("TIMEOUT", "OpenAI took too long. Please try again.", 504);
    }
    throw new OpenAiError("NETWORK", "Could not reach OpenAI.", 502);
  } finally {
    clearTimeout(timer);
  }
}

function mapHttpError(status: number, fallback: string): OpenAiError {
  if (status === 401) {
    return new OpenAiError(
      "INVALID_CREDENTIALS",
      "OpenAI key was rejected. Re-check OPENAI_API_KEY on the server.",
      502,
      status,
    );
  }
  if (status === 403) {
    return new OpenAiError("PROVIDER_ERROR", "OpenAI blocked this server. Try again later.", 502, status);
  }
  if (status === 429) {
    return new OpenAiError(
      "QUOTA_EXCEEDED",
      "OpenAI rate limit or quota reached. Check billing, then try again.",
      429,
      status,
    );
  }
  if (status === 400 || status === 422) {
    return new OpenAiError("BAD_REQUEST", fallback, 400, status);
  }
  return new OpenAiError("PROVIDER_ERROR", fallback, 502, status);
}

/** Translate text with ChatGPT. Returns plain translated string. */
export async function openaiTranslate(
  config: OpenAiClientConfig,
  input: { text: string; fromLanguage: string; toLanguage: string },
): Promise<string> {
  const text = input.text.replace(/\s+/g, " ").trim();
  if (!text) throw new OpenAiError("BAD_REQUEST", "Text is required.", 400);
  if (input.fromLanguage === input.toLanguage) {
    throw new OpenAiError("BAD_REQUEST", "Source and target language are the same.", 400);
  }

  const resolved = resolveConfig(config);
  const system = tijarTranslateSystemPrompt(input.fromLanguage, input.toLanguage);

  const user = `Translate from ${input.fromLanguage} to ${input.toLanguage}:\n\n${text.slice(0, 2000)}`;

  const res = await fetchWithTimeout(
    resolved.fetchImpl,
    `${resolved.baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resolved.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        model: resolved.chatModel,
        temperature: 0.2,
        max_tokens: 1200,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    },
    resolved.timeoutMs,
  );

  if (!res.ok) {
    throw mapHttpError(res.status, "Translation failed. Please try again.");
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const out = data.choices?.[0]?.message?.content?.trim();
  if (!out) throw new OpenAiError("PROVIDER_ERROR", "Empty translation from OpenAI.", 502);
  return out.replace(/^["']|["']$/g, "").trim();
}

export async function openaiVisionSearchQuery(
  imageDataUrl: string,
  config: OpenAiClientConfig = {},
): Promise<string> {
  const resolved = resolveConfig(config);
  const res = await fetchWithTimeout(
    resolved.fetchImpl,
    `${resolved.baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resolved.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        model: resolved.chatModel,
        temperature: 0.1,
        max_tokens: 40,
        messages: [
          {
            role: "system",
            content:
              "You name products in a shopper photo for a Nigerian informal marketplace. Reply with 2 to 6 short search words only, no sentence, no quotes. Example: red ankara gown",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "What product is this? Search words only." },
              { type: "image_url", image_url: { url: imageDataUrl.slice(0, 1_400_000) } },
            ],
          },
        ],
      }),
    },
    resolved.timeoutMs,
  );
  if (!res.ok) {
    throw mapHttpError(res.status, "Could not read that photo.");
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const out = data.choices?.[0]?.message?.content?.trim() ?? "";
  return out.replace(/^["']|["']$/g, "").replace(/\s+/g, " ").slice(0, 80);
}

export async function openaiChat(
  input: { system: string; user: string },
  config: OpenAiClientConfig = {},
): Promise<string> {
  const resolved = resolveConfig(config);
  const res = await fetchWithTimeout(
    resolved.fetchImpl,
    `${resolved.baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resolved.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        model: resolved.chatModel,
        temperature: 0.4,
        max_tokens: 500,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user.slice(0, 4000) },
        ],
      }),
    },
    resolved.timeoutMs,
  );
  if (!res.ok) {
    throw mapHttpError(res.status, "Assistant failed. Please try again.");
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const out = data.choices?.[0]?.message?.content?.trim();
  if (!out) throw new OpenAiError("PROVIDER_ERROR", "Empty reply from OpenAI.", 502);
  return out;
}

export type OpenAiSttResult = { text: string };

/** Transcribe speech with Whisper. */
export async function openaiStt(
  config: OpenAiClientConfig,
  input: { audio: Blob; language?: string; mimeType?: string; filename?: string },
): Promise<OpenAiSttResult> {
  const resolved = resolveConfig(config);
  const form = new FormData();
  const ext =
    (input.mimeType || input.audio.type || "").includes("mp4") ||
    (input.mimeType || "").includes("m4a")
      ? "m4a"
      : (input.mimeType || input.audio.type || "").includes("mpeg") ||
          (input.mimeType || "").includes("mp3")
        ? "mp3"
        : (input.mimeType || input.audio.type || "").includes("wav")
          ? "wav"
          : "webm";
  const file = new File([input.audio], input.filename ?? `speech.${ext}`, {
    type: input.mimeType || input.audio.type || `audio/${ext}`,
  });
  form.append("file", file);
  form.append("model", resolved.sttModel);
  form.append("response_format", "json");
  if (input.language && isOpenAiLanguage(input.language)) {
    const code = WHISPER_LANG[input.language];
    if (code) form.append("language", code);
  }

  const res = await fetchWithTimeout(
    resolved.fetchImpl,
    `${resolved.baseUrl}/audio/transcriptions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resolved.apiKey}`,
        "User-Agent": USER_AGENT,
      },
      body: form,
    },
    resolved.timeoutMs,
  );

  if (!res.ok) {
    throw mapHttpError(res.status, "Could not understand the recording. Please try again.");
  }

  const data = (await res.json()) as { text?: string };
  const text = data.text?.trim();
  if (!text) throw new OpenAiError("PROVIDER_ERROR", "Empty transcript from OpenAI.", 502);
  return { text };
}

export type OpenAiTtsResult = { bytes: ArrayBuffer; contentType: string };

/** Synthesize speech with OpenAI TTS (mp3). */
export async function openaiTts(
  config: OpenAiClientConfig,
  input: {
    text: string;
    language?: string;
    speakingRate?: number;
    /** OpenAI stock voice id (nova, alloy, …). */
    voice?: string;
  },
): Promise<OpenAiTtsResult> {
  const cleaned = input.text.replace(/\s+/g, " ").trim();
  if (!cleaned) throw new OpenAiError("BAD_REQUEST", "Text is required for speech.", 400);

  const resolved = resolveConfig(config);
  const voice = (input.voice || "nova").trim() || "nova";
  const res = await fetchWithTimeout(
    resolved.fetchImpl,
    `${resolved.baseUrl}/audio/speech`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resolved.apiKey}`,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        model: resolved.ttsModel,
        voice,
        input: cleaned.slice(0, 1000),
        response_format: "mp3",
        speed: Math.min(2, Math.max(0.5, input.speakingRate ?? 1)),
      }),
    },
    resolved.timeoutMs,
  );

  if (!res.ok) {
    throw mapHttpError(res.status, "Speech failed. Please try again.");
  }

  const bytes = await res.arrayBuffer();
  if (!bytes.byteLength) {
    throw new OpenAiError("PROVIDER_ERROR", "Empty audio from OpenAI.", 502);
  }
  return { bytes, contentType: res.headers.get("content-type") || "audio/mpeg" };
}

/** True when a usable OpenAI key is present on the server. */
export function isOpenAiConfigured(env?: Record<string, string | undefined>): boolean {
  return Boolean(readOpenAiConfig(env).apiKey);
}
