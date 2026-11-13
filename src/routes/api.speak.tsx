import { createFileRoute } from "@tanstack/react-router";

import {
  TRANSLATE_MAX_BODY_BYTES,
  assertJsonContentType,
  assertTranslateOrigin,
  clientIp,
  jsonSecure,
  readJsonBody,
} from "@/lib/api/security";
import { gatewayErrorResponse, replayDuplicateAi, runTimedProvider, startAiSession } from "@/lib/ai/gateway";
import { ownsAiVoice } from "@/lib/ai/ownership";
import { evaluateCustomVoiceAccess } from "@/lib/ai/voice-access";
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

        const body = { ...(parsed.body as Record<string, unknown>) };
        const customVoiceId = typeof body.customVoiceId === "string" ? body.customVoiceId : "";
        if (customVoiceId) {
          const owned = await ownsAiVoice(request, customVoiceId);
          const access = evaluateCustomVoiceAccess(customVoiceId, owned);
          if (!access.ok) {
            return jsonSecure(
              { error: { code: access.code, message: access.message } },
              { status: access.status },
            );
          }
        }
        const session = await startAiSession({ request, service: "tts" });
        if (!session.ok) {
          return jsonSecure(gatewayErrorResponse(session), { status: session.status });
        }
        const replayed = replayDuplicateAi(session);
        if (replayed) return replayed;
        const timed = await runTimedProvider(
          session,
          speakTextServer(body, {
            rateLimitKey: `speak-ip:${clientIp(request)}`,
            rateLimit: 30,
          }),
        );
        if (!timed.ok) {
          const timeoutBody = { error: { code: "TIMEOUT", message: "Speech timed out." } };
          await session.saveReplay({ httpStatus: 504, body: timeoutBody });
          await session.finish({ status: "failed", errorCode: "TIMEOUT", refund: session.refundOnTimeout });
          return jsonSecure(timeoutBody, { status: 504 });
        }
        const result = timed.value;
        if (!result.ok) {
          const errBody = { error: { code: result.code, message: result.message } };
          await session.saveReplay({ httpStatus: result.status, body: errBody });
          await session.finish({ status: "failed", errorCode: result.code });
          return jsonSecure(errBody, { status: result.status });
        }

        const bytes = result.audio.bytes instanceof Uint8Array ? result.audio.bytes : new Uint8Array(result.audio.bytes);
        await session.saveReplay({
          httpStatus: 200,
          audioBase64: Buffer.from(bytes).toString("base64"),
          contentType: result.audio.contentType,
          headers: { "X-Speech-Language": result.language },
        });
        await session.finish({ status: "succeeded" });
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
