import { createFileRoute } from "@tanstack/react-router";

import {
  assertJsonContentType,
  assertTranslateOrigin,
  jsonSecure,
  readJsonBody,
  TRANSLATE_MAX_BODY_BYTES,
} from "@/lib/api/security";
import { tijarAssistantChat } from "@/lib/ai/tijar-chat";

export const Route = createFileRoute("/api/assistant/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const origin = assertTranslateOrigin(request);
        if (!origin.ok) {
          return jsonSecure({ error: origin.message }, { status: origin.status });
        }
        const media = assertJsonContentType(request);
        if (!media.ok) {
          return jsonSecure({ error: media.message }, { status: media.status });
        }
        const parsed = await readJsonBody(request, TRANSLATE_MAX_BODY_BYTES);
        if (!parsed.ok) {
          return jsonSecure({ error: parsed.message }, { status: parsed.status });
        }
        const body = parsed.body as { text?: string; language?: string; shop?: string };
        const text = typeof body.text === "string" ? body.text.trim() : "";
        if (!text) return jsonSecure({ error: "Empty message" }, { status: 400 });
        try {
          const reply = await tijarAssistantChat({
            text,
            language: body.language,
            shop: body.shop,
          });
          return jsonSecure({ reply });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Assistant unavailable";
          return jsonSecure({ error: message }, { status: 502 });
        }
      },
    },
  },
});
