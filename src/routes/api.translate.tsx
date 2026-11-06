import { createFileRoute } from "@tanstack/react-router";

import {
  TRANSLATE_MAX_BODY_BYTES,
  assertJsonContentType,
  assertTranslateOrigin,
  jsonSecure,
  readJsonBody,
  resolveTranslateRateKey,
} from "@/lib/api/security";
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

        const { rateLimitKey, authenticated } = await resolveTranslateRateKey(request);
        // Signed-in users get a slightly higher ceiling; IP is always in the key.
        const result = await translateText(parsed.body, {
          rateLimitKey,
          rateLimit: authenticated ? 40 : 20,
        });

        if (!result.ok) {
          return jsonSecure(
            { error: { code: result.code, message: result.message } },
            { status: result.status },
          );
        }
        return jsonSecure({
          translatedText: result.translatedText,
          fromLanguage: result.fromLanguage,
          toLanguage: result.toLanguage,
          cached: result.cached,
        });
      },
    },
  },
});
