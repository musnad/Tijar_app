/**
 * Orchestrates speech: text-to-speech, speech-to-text, and speech translation.
 *
 *   Speak-back   : ElevenLabs personal clone → OpenAI TTS
 *   Understand   : OpenAI Whisper STT (+ ChatGPT/Grok text translation)
 *
 * No third-party African-language vendor is required — the models above are
 * prompt-driven and cover the full TIJAR language catalogue (Hausa included).
 */

import { z } from "zod";

import { elevenLabsTts, isElevenLabsConfigured } from "@/lib/elevenlabs/client";
import {
  isOpenAiConfigured,
  openaiStt,
  openaiTts,
  OpenAiError,
  type OpenAiClientConfig,
} from "@/lib/openai/client";
import { isOpenAiTtsVoice } from "@/lib/openai/voices";
import type { XaiClientConfig } from "@/lib/xai/client";

import { checkRateLimit } from "@/lib/api/rate-limit";
import { isTijarLanguage, whisperCodeFor } from "./languages";
import { translateText } from "./service";

export const MAX_SPEECH_AUDIO_BYTES = 5 * 1024 * 1024;
export const ALLOWED_SPEECH_TYPES = [
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/wave",
  "audio/x-m4a",
  "audio/m4a",
] as const;

export function isAllowedSpeechType(type: string): boolean {
  if (!type) return true; // some browsers omit type
  const base = type.split(";")[0]!.trim().toLowerCase();
  if ((ALLOWED_SPEECH_TYPES as readonly string[]).includes(base)) return true;
  // e.g. audio/webm;codecs=opus already stripped — also accept vendor prefixes
  return base.startsWith("audio/");
}

const speakSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  language: z.string().trim().min(1).max(40),
  // OpenAI TTS speed range 0.25–4.0; keep the shopkeeper-friendly 0.5–2.0.
  speakingRate: z.number().min(0.5).max(2).optional(),
  /** OpenAI stock voice (nova, alloy, …). */
  voice: z.string().trim().min(1).max(40).optional(),
  /** ElevenLabs (or other) personal clone id. */
  customVoiceId: z.string().trim().min(1).max(120).optional(),
});

export type SpeakDeps = {
  openAiConfig?: OpenAiClientConfig | undefined;
  xaiConfig?: XaiClientConfig | undefined;
  rateLimitKey?: string | undefined;
  rateLimit?: number | undefined;
};

export type SpeakResult =
  | { ok: true; audio: { bytes: ArrayBuffer; contentType: string }; language: string }
  | { ok: false; status: number; code: string; message: string };

/** Speak text. ElevenLabs personal clone first, then OpenAI stock voices. */
export async function speakTextServer(raw: unknown, deps: SpeakDeps = {}): Promise<SpeakResult> {
  const parsed = speakSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      code: "VALIDATION",
      message: parsed.error.errors[0]?.message ?? "Invalid speak request.",
    };
  }

  if (!isTijarLanguage(parsed.data.language)) {
    return {
      ok: false,
      status: 400,
      code: "UNSUPPORTED_LANGUAGE",
      message: `Speech does not support "${parsed.data.language}" yet.`,
    };
  }

  if (deps.rateLimitKey) {
    const limit = checkRateLimit(deps.rateLimitKey, deps.rateLimit ?? 20);
    if (!limit.allowed) {
      return {
        ok: false,
        status: 429,
        code: "RATE_LIMITED",
        message: `Too many speak requests. Try again in ${limit.retryAfterSeconds}s.`,
      };
    }
  }

  // 1) Personal clone (ElevenLabs) when the user enrolled their voice
  if (parsed.data.customVoiceId && isElevenLabsConfigured()) {
    try {
      const audio = await elevenLabsTts({
        voiceId: parsed.data.customVoiceId,
        text: parsed.data.text,
      });
      return { ok: true, audio, language: parsed.data.language };
    } catch {
      // Fall through to OpenAI TTS
    }
  }

  // 2) OpenAI TTS (stock or user-preferred voice)
  if (deps.openAiConfig?.apiKey || (deps.openAiConfig === undefined && isOpenAiConfigured())) {
    try {
      const preferred = parsed.data.voice && isOpenAiTtsVoice(parsed.data.voice) ? parsed.data.voice : "nova";
      const audio = await openaiTts(deps.openAiConfig ?? {}, {
        text: parsed.data.text,
        language: parsed.data.language,
        speakingRate: parsed.data.speakingRate,
        voice: preferred,
      });
      return { ok: true, audio, language: parsed.data.language };
    } catch (err) {
      if (err instanceof OpenAiError) {
        return { ok: false, status: err.status, code: err.code, message: err.message };
      }
      return { ok: false, status: 502, code: "PROVIDER_ERROR", message: "Speech failed. Please try again." };
    }
  }

  return {
    ok: false,
    status: 503,
    code: "NOT_CONFIGURED",
    message: "Speech is not configured on this server (missing OPENAI_API_KEY or ELEVENLABS_API_KEY).",
  };
}

export type TranscribeResult =
  | {
      ok: true;
      transcript: string;
      language: string;
      mode: "stt" | "speech-translate";
      translatedText?: string;
    }
  | { ok: false; status: number; code: string; message: string };

export type TranscribeInput = {
  audio: Blob;
  language: string;
  /** When set with a different language, translate the transcript too. */
  toLanguage?: string;
};

/** Transcribe a recording with Whisper, translating it when a target is given. */
export async function transcribeOrTranslateSpeech(
  input: TranscribeInput,
  deps: SpeakDeps = {},
): Promise<TranscribeResult> {
  if (!(input.audio instanceof Blob) || input.audio.size === 0) {
    return { ok: false, status: 400, code: "VALIDATION", message: "Audio recording is required." };
  }
  if (input.audio.size > MAX_SPEECH_AUDIO_BYTES) {
    return {
      ok: false,
      status: 400,
      code: "AUDIO_TOO_LARGE",
      message: "Recording is too large (max 5 MB / about 60 seconds).",
    };
  }
  if (input.audio.type && !isAllowedSpeechType(input.audio.type)) {
    return {
      ok: false,
      status: 400,
      code: "AUDIO_UNSUPPORTED",
      message: `Audio type ${input.audio.type} is not supported.`,
    };
  }

  if (!isTijarLanguage(input.language)) {
    return {
      ok: false,
      status: 400,
      code: "UNSUPPORTED_LANGUAGE",
      message: `Speech does not support "${input.language}" yet.`,
    };
  }

  if (deps.rateLimitKey) {
    const limit = checkRateLimit(deps.rateLimitKey, deps.rateLimit ?? 10);
    if (!limit.allowed) {
      return {
        ok: false,
        status: 429,
        code: "RATE_LIMITED",
        message: `Too many voice requests. Try again in ${limit.retryAfterSeconds}s.`,
      };
    }
  }

  const from = input.language;
  const toRaw = input.toLanguage?.trim();
  const to = toRaw && toRaw !== from && isTijarLanguage(toRaw) ? toRaw : null;

  if (!(deps.openAiConfig?.apiKey || (deps.openAiConfig === undefined && isOpenAiConfigured()))) {
    return {
      ok: false,
      status: 503,
      code: "NOT_CONFIGURED",
      message: "Speech is not configured on this server (missing OPENAI_API_KEY).",
    };
  }

  try {
    const stt = await openaiStt(deps.openAiConfig ?? {}, {
      audio: input.audio,
      language: from,
      languageCode: whisperCodeFor(from),
      mimeType: input.audio.type || undefined,
    });

    if (!to) {
      return { ok: true, transcript: stt.text, language: from, mode: "stt" };
    }

    const translated = await translateText(
      { text: stt.text, fromLanguage: from, toLanguage: to },
      { openAiConfig: deps.openAiConfig, xaiConfig: deps.xaiConfig },
    );
    if (!translated.ok) {
      return { ok: true, transcript: stt.text, language: from, mode: "stt" };
    }
    return {
      ok: true,
      transcript: stt.text,
      translatedText: translated.translatedText,
      language: to,
      mode: "speech-translate",
    };
  } catch (err) {
    if (err instanceof OpenAiError) {
      return { ok: false, status: err.status, code: err.code, message: err.message };
    }
    return {
      ok: false,
      status: 502,
      code: "PROVIDER_ERROR",
      message: "Could not process speech. Please try again.",
    };
  }
}
