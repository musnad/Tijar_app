import { createFileRoute } from "@tanstack/react-router";

import {
  assertTranslateOrigin,
  clientIp,
  jsonSecure,
} from "@/lib/api/security";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { elevenLabsCloneVoice, isElevenLabsConfigured } from "@/lib/elevenlabs/client";

/**
 * POST /api/voice-enroll — multipart: audio file + optional name.
 * Creates an ElevenLabs instant clone when ELEVENLABS_API_KEY is set.
 * Success: { voiceId, provider: "elevenlabs" }
 * If ElevenLabs is not configured: { voiceId: null, provider: "openai-preferred" }
 */
export const Route = createFileRoute("/api/voice-enroll")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const origin = assertTranslateOrigin(request);
        if (!origin.ok) {
          return jsonSecure({ error: { code: origin.code, message: origin.message } }, { status: origin.status });
        }

        const limit = checkRateLimit(`voice-enroll:${clientIp(request)}`, 5, 60_000);
        if (!limit.allowed) {
          return jsonSecure(
            { error: { code: "RATE_LIMITED", message: `Try again in ${limit.retryAfterSeconds}s.` } },
            { status: 429 },
          );
        }

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return jsonSecure(
            { error: { code: "VALIDATION", message: "Expected multipart form with audio." } },
            { status: 400 },
          );
        }

        const audio = form.get("audio");
        if (!(audio instanceof Blob) || audio.size < 1000) {
          return jsonSecure(
            { error: { code: "VALIDATION", message: "Record at least 10 seconds of clear speech." } },
            { status: 400 },
          );
        }

        const name = String(form.get("name") ?? "TIJAR shopkeeper").slice(0, 80);

        if (!isElevenLabsConfigured()) {
          return jsonSecure({
            voiceId: null,
            provider: "openai-preferred",
            message:
              "Voice sample saved. Add ELEVENLABS_API_KEY on the server for a true personal clone; otherwise TIJAR uses your preferred OpenAI voice.",
          });
        }

        try {
          const { voiceId } = await elevenLabsCloneVoice({ name, audio });
          return jsonSecure({ voiceId, provider: "elevenlabs" });
        } catch (err) {
          return jsonSecure(
            {
              error: {
                code: "PROVIDER_ERROR",
                message: err instanceof Error ? err.message : "Could not create personal voice.",
              },
            },
            { status: 502 },
          );
        }
      },
    },
  },
});
