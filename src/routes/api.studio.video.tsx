import { createFileRoute } from "@tanstack/react-router";

import {
  assertJsonContentType,
  assertTranslateOrigin,
  clientIp,
  jsonSecure,
  readJsonBody,
  requireAuthenticatedUser,
} from "@/lib/api/security";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { grokStartVideo, isXaiConfigured, XaiError } from "@/lib/xai/client";

const MAX_BYTES = 1_200_000;

export const Route = createFileRoute("/api/studio/video")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const origin = assertTranslateOrigin(request);
        if (!origin.ok) return jsonSecure({ error: { code: origin.code, message: origin.message } }, { status: origin.status });
        const auth = await requireAuthenticatedUser(request);
        if (!auth.ok) {
          return jsonSecure({ error: { code: auth.code, message: "Sign in to design with Grok." } }, { status: 401 });
        }
        const media = assertJsonContentType(request);
        if (!media.ok) return jsonSecure({ error: { code: media.code, message: media.message } }, { status: media.status });
        const limit = checkRateLimit(`studio-video:${clientIp(request)}`, 4, 60_000);
        if (!limit.allowed) {
          return jsonSecure({ error: { code: "RATE_LIMITED", message: "Too many video jobs. Wait a minute." } }, { status: 429 });
        }
        const parsed = await readJsonBody(request, MAX_BYTES);
        if (!parsed.ok) return jsonSecure({ error: { code: parsed.code, message: parsed.message } }, { status: parsed.status });
        const body = parsed.body as {
          prompt?: unknown;
          imageDataUrl?: unknown;
          durationSec?: unknown;
          voiceId?: unknown;
          language?: unknown;
        };
        const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 1200) : "";
        const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl : "";
        const durationSec = typeof body.durationSec === "number" ? body.durationSec : 8;
        const voiceId = typeof body.voiceId === "string" ? body.voiceId.trim().slice(0, 32) : "eve";
        const language = typeof body.language === "string" && body.language.trim() ? body.language.trim().slice(0, 40) : "English";
        if (prompt.length < 8) {
          return jsonSecure({ error: { code: "VALIDATION", message: "Write what the advert should say." } }, { status: 400 });
        }
        if (imageDataUrl && !imageDataUrl.startsWith("data:image/")) {
          return jsonSecure({ error: { code: "VALIDATION", message: "Photo must be a JPEG or PNG." } }, { status: 400 });
        }
        if (!isXaiConfigured()) {
          return jsonSecure({ fallback: true, grok: false });
        }
        try {
          const spoken = prompt.includes("<AUDIO_0>")
            ? prompt
            : `<IMAGE_0> a cheerful shop advert, product in frame, cute and bright. Voice-over language is ${language} only. <AUDIO_0> says in ${language}: ${prompt}`;
          const started = await grokStartVideo({
            prompt: spoken,
            imageDataUrl: imageDataUrl || undefined,
            durationSec,
            voiceId: voiceId || "eve",
          });
          return jsonSecure({ fallback: false, grok: true, requestId: started.requestId });
        } catch (err) {
          if (err instanceof XaiError) {
            return jsonSecure({ error: { code: err.code, message: err.message }, fallback: true, grok: true }, { status: err.status >= 500 ? err.status : 200 });
          }
          return jsonSecure({ fallback: true, grok: true, error: { code: "PROVIDER_ERROR", message: "Grok video is unavailable. Use local advert instead." } });
        }
      },
    },
  },
});
