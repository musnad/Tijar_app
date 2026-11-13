import { createFileRoute } from "@tanstack/react-router";

import {
  TRANSLATE_MAX_BODY_BYTES,
  assertJsonContentType,
  assertTranslateOrigin,
  jsonSecure,
  readJsonBody,
  resolveTranslateRateKey,
} from "@/lib/api/security";
import { gatewayErrorResponse, replayDuplicateAi, runTimedProvider, startAiSession } from "@/lib/ai/gateway";
import { translateText } from "@/lib/translation/service";

/**
 * POST /api/translate  { text, fromLanguage, toLanguage }
 *
 * Security:
 * - XAI_API_KEY / OPENAI_API_KEY stay server-only (never sent to the browser)
 * - Same-site / allowlisted Origin only
 * - JSON + size capped
 * - Rate limit bound to real client IP (JWT alone cannot bypass)
 * - Request/response text is never logged; provider errors are mapped
 */
export const Route = createFileRoute("/api/translate")({
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

        const { rateLimitKey } = await resolveTranslateRateKey(request);
        const session = await startAiSession({ request, service: "translate" });
        if (!session.ok) {
          return jsonSecure(gatewayErrorResponse(session), { status: session.status });
        }
        const replayed = replayDuplicateAi(session);
        if (replayed) return replayed;
        const timed = await runTimedProvider(
          session,
          translateText(parsed.body, {
            rateLimitKey,
            rateLimit: 40,
          }),
        );
        if (!timed.ok) {
          const timeoutBody = { error: { code: "TIMEOUT", message: "Translation timed out." } };
          await session.saveReplay({ httpStatus: 504, body: timeoutBody });
          await session.finish({ status: "failed", errorCode: "TIMEOUT", refund: session.refundOnTimeout });
          return jsonSecure(timeoutBody, { status: 504 });
        }
        const result = timed.value;
        if (!result.ok) {
          const errBody = { error: { code: result.code, message: result.message } };
          await session.saveReplay({ httpStatus: result.status, body: errBody });
          await session.finish({
            status: "failed",
            provider: session.provider,
            errorCode: result.code,
          });
          return jsonSecure(errBody, { status: result.status });
        }
        const okBody = {
          translatedText: result.translatedText,
          fromLanguage: result.fromLanguage,
          toLanguage: result.toLanguage,
          cached: result.cached,
        };
        await session.saveReplay({ httpStatus: 200, body: okBody });
        await session.finish({
          status: "succeeded",
          provider: result.cached ? "cache" : result.engine === "tijar" ? "vllm" : result.engine === "openai" ? "openai" : "xai",
        });
        return jsonSecure(okBody);
      },
    },
  },
});
