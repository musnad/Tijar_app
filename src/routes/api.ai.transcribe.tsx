import { createFileRoute } from "@tanstack/react-router";

import {
  assertTranslateOrigin,
  clientIp,
  jsonSecure,
  requireAuthenticatedUser,
} from "@/lib/nkenne/api-security";
import { transcribeOrTranslateSpeech } from "@/lib/nkenne/speech-service";

export const Route = createFileRoute("/api/ai/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const origin = assertTranslateOrigin(request);
        if (!origin.ok) {
          return jsonSecure({ error: { code: origin.code, message: origin.message } }, { status: origin.status });
        }
        const auth = await requireAuthenticatedUser(request);
        if (!auth.ok) {
          return jsonSecure({ error: { code: auth.code, message: "Sign in to use voice." } }, { status: auth.status });
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
          return jsonSecure({ error: { code: "VALIDATION", message: "Invalid voice request." } }, { status: 400 });
        }
        const file = form.get("audio") ?? form.get("audio_file");
        if (!(file instanceof File) && !(file instanceof Blob)) {
          return jsonSecure({ error: { code: "VALIDATION", message: "Audio recording is required." } }, { status: 400 });
        }
        const language = String(form.get("language") ?? "English").trim() || "English";
        const result = await transcribeOrTranslateSpeech(
          { audio: file, language },
          { rateLimitKey: `ai-stt:${clientIp(request)}|${auth.userId}`, rateLimit: 20 },
        );
        if (!result.ok) {
          return jsonSecure(
            { error: { code: result.code, message: result.message } },
            { status: result.status },
          );
        }
        return jsonSecure({ transcript: result.transcript, language: result.language });
      },
    },
  },
});
