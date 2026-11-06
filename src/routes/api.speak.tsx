import { createFileRoute } from "@tanstack/react-router";

import {
  TRANSLATE_MAX_BODY_BYTES,
  assertJsonContentType,
  assertTranslateOrigin,
  clientIp,
  jsonSecure,
  readJsonBody,
} from "@/lib/api/security";
import { speakTextServer } from "@/lib/speech/service";

/**
 * POST /api/speak — OpenAI TTS (personal clone via ElevenLabs when enrolled).
 * Body: { text, language, speakingRate? }
 * Success: raw audio bytes (audio/wav or audio/mpeg)
 * Errors: JSON { error: { code, message } }
 */
export const Route = createFileRoute("/api/speak")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const origin = assertTranslateOrigin(request);
        if (!origin.ok) {
          return jsonSecure({ error: { code: origin.code, message: origin.message } }, { status: origin.status });
        }
        const media = assertJsonContentType(request);
        if (!media.ok) {
          return jsonSecure({ error: { code: media.code, message: media.message } }, { status: media.status });
        }

        const parsed = await readJsonBody(request, TRANSLATE_MAX_BODY_BYTES);
        if (!parsed.ok) {
          return jsonSecure({ error: { code: parsed.code, message: parsed.message } }, { status: parsed.status });
        }

        const result = await speakTextServer(parsed.body, {
          rateLimitKey: `speak-ip:${clientIp(request)}`,
          rateLimit: 30,
        });

        if (!result.ok) {
          return jsonSecure(
            { error: { code: result.code, message: result.message } },
            { status: result.status },
          );
        }

        return new Response(result.audio.bytes, {
          status: 200,
          headers: {
            "Content-Type": result.audio.contentType,
            "Cache-Control": "no-store, no-cache, must-revalidate, private",
            "X-Content-Type-Options": "nosniff",
            "X-Speech-Language": result.language,
          },
        });
      },
    },
  },
});
