import { createFileRoute } from "@tanstack/react-router";

import { jsonSecure } from "@/lib/api/security";
import { readOpenAiConfig } from "@/lib/openai/client";
import { isXaiConfigured } from "@/lib/xai/client";

export const Route = createFileRoute("/api/studio/status")({
  server: {
    handlers: {
      GET: async () => {
        const openai = readOpenAiConfig();
        const grok = isXaiConfigured();
        return jsonSecure({
          grok,
          tts: Boolean(openai.apiKey),
          design: grok || Boolean(openai.apiKey),
        });
      },
    },
  },
});
