import { createFileRoute } from "@tanstack/react-router";

import {
  assertJsonContentType,
  assertTranslateOrigin,
  clientIp,
  jsonSecure,
  readJsonBody,
} from "@/lib/api/security";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { openaiGenerateImage } from "@/lib/openai/images";
import { grokGenerateImage, isXaiConfigured, XaiError } from "@/lib/xai/client";

const MAX_BYTES = 1_200_000;

export const Route = createFileRoute("/api/studio/flyer")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const origin = assertTranslateOrigin(request);
        if (!origin.ok) return jsonSecure({ error: { code: origin.code, message: origin.message } }, { status: origin.status });
        const media = assertJsonContentType(request);
        if (!media.ok) return jsonSecure({ error: { code: media.code, message: media.message } }, { status: media.status });
        const limit = checkRateLimit(`studio-flyer:${clientIp(request)}`, 8, 60_000);
        if (!limit.allowed) {
          return jsonSecure({ error: { code: "RATE_LIMITED", message: "Too many flyers. Wait a minute." } }, { status: 429 });
        }
        const parsed = await readJsonBody(request, MAX_BYTES);
        if (!parsed.ok) return jsonSecure({ error: { code: parsed.code, message: parsed.message } }, { status: parsed.status });
        const body = parsed.body as {
          prompt?: unknown;
          productName?: unknown;
          businessName?: unknown;
          style?: unknown;
          language?: unknown;
          imageDataUrl?: unknown;
        };
        const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 1200) : "";
        const productName = typeof body.productName === "string" ? body.productName.trim().slice(0, 80) : "";
        const businessName = typeof body.businessName === "string" ? body.businessName.trim().slice(0, 80) : "TIJAR shop";
        const style = typeof body.style === "string" ? body.style.trim().slice(0, 40) : "modern";
        const language = typeof body.language === "string" && body.language.trim() ? body.language.trim().slice(0, 40) : "English";
        const imageDataUrl =
          typeof body.imageDataUrl === "string" && body.imageDataUrl.startsWith("data:image/") ? body.imageDataUrl : "";
        if (prompt.length < 4) {
          return jsonSecure({ error: { code: "VALIDATION", message: "Write what you want designed." } }, { status: 400 });
        }

        const full = [
          prompt,
          productName ? `This flyer must clearly sell: ${productName} from ${businessName}.` : `Shop: ${businessName}.`,
          `Style: ${style}. Language of every visible word: ${language}. Keep the shopkeeper's wording; do not translate it away.`,
          `Professional print-ready advertising flyer, 3:4 portrait, sharp typography, premium lighting, generous whitespace.`,
          `Navy #0B1F4D and green #1F7A4D unless the prompt names other colours. No watermarks, no extra brand logos besides a small TIJAR wordmark if needed.`,
        ].join("\n");

        if (isXaiConfigured()) {
          try {
            const img = await grokGenerateImage({
              prompt: full,
              aspectRatio: "3:4",
              imageDataUrl: imageDataUrl || undefined,
            });
            return jsonSecure({ fallback: false, grok: true, dataUrl: img.dataUrl });
          } catch (err) {
            if (!(err instanceof XaiError) || err.code !== "INVALID_CREDENTIALS") {
              /* try OpenAI next */
            }
          }
        }

        const openai = await openaiGenerateImage(full);
        if (openai?.dataUrl) {
          return jsonSecure({ fallback: false, grok: false, dataUrl: openai.dataUrl });
        }

        return jsonSecure({ fallback: true, grok: isXaiConfigured() });
      },
    },
  },
});
