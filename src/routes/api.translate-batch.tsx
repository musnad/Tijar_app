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
        const result = await translateBatch(parsed.body, { rateLimitKey, rateLimit: 10 });
        if (!result.ok) {
          return jsonSecure({ error: { code: result.code, message: result.message } }, { status: result.status });
        }
        return jsonSecure({ translations: result.translations });
      },
    },
  },
});
