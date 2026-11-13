import { createFileRoute } from "@tanstack/react-router";

import {
  TRANSLATE_BATCH_MAX_BODY_BYTES,
  assertJsonContentType,
  assertTranslateOrigin,
  jsonSecure,
  readJsonBody,
  requireAuthenticatedUser,
  resolveTranslateRateKey,
} from "@/lib/api/security";
import { gatewayErrorResponse, replayDuplicateAi, runTimedProvider, startAiSession } from "@/lib/ai/gateway";
import { translateBatch } from "@/lib/translation/service";

/**
 * POST /api/translate-batch { texts[], fromLanguage, toLanguage } — max 20.
 * Auth required (verified Supabase JWT). Used by the admin system-string tool.
 */
export const Route = createFileRoute("/api/translate-batch")({
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
        const auth = await requireAuthenticatedUser(request);
        if (!auth.ok) {
          return jsonSecure({ error: { code: auth.code, message: auth.message } }, { status: auth.status });
        }

        const parsed = await readJsonBody(request, TRANSLATE_BATCH_MAX_BODY_BYTES);
        if (!parsed.ok) {
          return jsonSecure({ error: { code: parsed.code, message: parsed.message } }, { status: parsed.status });
        }

        const { rateLimitKey } = await resolveTranslateRateKey(request);
        const session = await startAiSession({ request, service: "translate_batch" });
        if (!session.ok) {
          return jsonSecure(gatewayErrorResponse(session), { status: session.status });
        }
        const replayed = replayDuplicateAi(session);
        if (replayed) return replayed;
        const timed = await runTimedProvider(session, translateBatch(parsed.body, { rateLimitKey, rateLimit: 10 }));
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
          await session.finish({ status: "failed", errorCode: result.code });
          return jsonSecure(errBody, { status: result.status });
        }
        const okBody = { translations: result.translations };
        await session.saveReplay({ httpStatus: 200, body: okBody });
        await session.finish({ status: "succeeded" });
        return jsonSecure(okBody);
      },
    },
  },
});
