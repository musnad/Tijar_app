import { createFileRoute } from "@tanstack/react-router";

import {
  assertJsonContentType,
  assertTranslateOrigin,
  jsonSecure,
  readJsonBody,
  resolveTranslateRateKey,
} from "@/lib/api/security";
import { openaiVisionSearchQuery } from "@/lib/openai/client";

const MAX_BODY = 1_600_000;

export const Route = createFileRoute("/api/search-image")({
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
        const parsed = await readJsonBody(request, MAX_BODY);
        if (!parsed.ok) {
          return jsonSecure({ error: { code: parsed.code, message: parsed.message } }, { status: parsed.status });
        }
        await resolveTranslateRateKey(request);
        const image = typeof (parsed.body as { image?: unknown }).image === "string" ? (parsed.body as { image: string }).image : "";
        if (!image.startsWith("data:image/")) {
          return jsonSecure({ error: { code: "VALIDATION", message: "Send a product photo." } }, { status: 400 });
        }
        try {
          const query = await openaiVisionSearchQuery(image);
          if (!query) {
            return jsonSecure({ error: { code: "EMPTY", message: "Could not tell what is in the photo." } }, { status: 422 });
          }
          return jsonSecure({ query });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not read that photo.";
          return jsonSecure({ error: { code: "PROVIDER_ERROR", message } }, { status: 502 });
        }
      },
    },
  },
});
