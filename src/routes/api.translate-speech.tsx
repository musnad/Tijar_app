import { createFileRoute } from "@tanstack/react-router";

import {
  assertTranslateOrigin,
  clientIp,
  jsonSecure,
} from "@/lib/api/security";
import { transcribeOrTranslateSpeech } from "@/lib/speech/service";

/**
 * POST /api/translate-speech — Whisper STT, then Grok text translate when toLanguage is set.
 *
 * multipart/form-data:
 *   audio | audio_file  — recording (≤5 MB)
 *   language            — source language display name (English, Yoruba, …)
 *   toLanguage          — optional target; when set, speech-translate or STT+text
 *
 * Success: { transcript, translatedText?, language, mode }
 */
export const Route = createFileRoute("/api/translate-speech")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const origin = assertTranslateOrigin(request);
        if (!origin.ok) {
          return jsonSecure({ error: { code: origin.code, message: origin.message } }, { status: origin.status });
        }

        const contentType = request.headers.get("content-type") ?? "";
        if (!contentType.includes("multipart/form-data")) {
          return jsonSecure(
            { error: { code: "UNSUPPORTED_MEDIA", message: "Send audio as multipart/form-data." } },
            { status: 415 },
          );
        }

        const form = await request.formData().catch(() => null);
        if (!form) {
          return jsonSecure(
            { error: { code: "VALIDATION", message: "Invalid voice request." } },
            { status: 400 },
          );
        }

        const file = form.get("audio") ?? form.get("audio_file");
        if (!(file instanceof File) && !(file instanceof Blob)) {
          return jsonSecure(
            { error: { code: "VALIDATION", message: "Audio recording is required." } },
            { status: 400 },
          );
        }

        const language = String(form.get("language") ?? form.get("fromLanguage") ?? "").trim();
        const toLanguageRaw = String(form.get("toLanguage") ?? "").trim();
        const toLanguage = toLanguageRaw || undefined;

        const result = await transcribeOrTranslateSpeech(
          {
            audio: file,
            language,
            toLanguage,
          },
          {
            rateLimitKey: `speech-ip:${clientIp(request)}`,
            rateLimit: 10,
          },
        );

        if (!result.ok) {
          return jsonSecure(
            { error: { code: result.code, message: result.message } },
            { status: result.status },
          );
        }

        return jsonSecure({
          transcript: result.transcript,
          translatedText: result.translatedText ?? null,
          language: result.language,
          mode: result.mode,
        });
      },
    },
  },
});
