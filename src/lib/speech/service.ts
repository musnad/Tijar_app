/**
 * Speech (TTS / STT). OpenAI Whisper + TTS, with ElevenLabs for a personal clone.
 * Text translation for speech-translate uses Grok first.
 */

import { z } from "zod";

import { elevenLabsTts, isElevenLabsConfigured } from "@/lib/elevenlabs/client";
import {
  isOpenAiConfigured,
  isOpenAiLanguage,
  openaiStt,
  openaiTts,
  OpenAiError,
  type OpenAiClientConfig,
  type OpenAiLanguage,
} from "@/lib/openai/client";
import { isOpenAiTtsVoice } from "@/lib/openai/voices";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { isTijarLanguage } from "@/lib/translation/languages";
import { translateText } from "@/lib/translation/service";

export type TtsResult = {
  bytes: ArrayBuffer;
  contentType: string;
};

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
  if (!type) return true;
  const base = type.split(";")[0]!.trim().toLowerCase();
  if ((ALLOWED_SPEECH_TYPES as readonly string[]).includes(base)) return true;
  return base.startsWith("audio/");
}

const speakSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  language: z.string().trim().min(1).max(40),
  speakingRate: z.number().min(0.5).max(2).optional(),
  voice: z.string().trim().min(1).max(40).optional(),
  customVoiceId: z.string().trim().min(1).max(120).optional(),
});

export type SpeakDeps = {
  openAiConfig?: OpenAiClientConfig;
  rateLimitKey?: string;
  rateLimit?: number;
};

export type SpeakResult =
  | { ok: true; audio: TtsResult; language: string }
  | { ok: false; status: number; code: string; message: string };

function isSpeechLanguage(value: string): boolean {
  return isTijarLanguage(value) || isOpenAiLanguage(value);
}

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

  if (!isSpeechLanguage(parsed.data.language)) {
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

  if (parsed.data.customVoiceId && isElevenLabsConfigured()) {
    try {
      const audio = await elevenLabsTts({
        voiceId: parsed.data.customVoiceId,
        text: parsed.data.text,
      });
      return { ok: true, audio, language: parsed.data.language };
    } catch {
      /* fall through */
    }
  }

  if (isOpenAiConfigured() || deps.openAiConfig?.apiKey) {
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
    message: "Speech is not configured on this server (missing OPENAI_API_KEY).",
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
  toLanguage?: string;
};

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

  if (!isSpeechLanguage(input.language)) {
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
  const to = toRaw && toRaw !== from && isSpeechLanguage(toRaw) ? toRaw : null;

  if (!isOpenAiConfigured() && !deps.openAiConfig?.apiKey) {
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
      language: isOpenAiLanguage(from) ? (from as OpenAiLanguage) : undefined,
      mimeType: input.audio.type || undefined,
    });

    if (!to) {
      return { ok: true, transcript: stt.text, language: from, mode: "stt" };
    }

    const translated = await translateText(
      { text: stt.text, fromLanguage: from, toLanguage: to },
      { openAiConfig: deps.openAiConfig },
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
