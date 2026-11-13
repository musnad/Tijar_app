import { createFileRoute } from "@tanstack/react-router";

import { guardVoiceEnrollmentAudio } from "@/lib/ai/audio-guard";
import { gatewayErrorResponse, replayDuplicateAi, runTimedProvider, startAiSession } from "@/lib/ai/gateway";
import { requireVoiceCloneProvider } from "@/lib/ai/voice-access";
import { bindAiVoice } from "@/lib/ai/ownership";
import {
  assertTranslateOrigin,
  clientIp,
  jsonSecure,
  requireAuthenticatedUser,
} from "@/lib/api/security";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { elevenLabsCloneVoice } from "@/lib/elevenlabs/client";

/**
 * POST /api/voice-enroll — authenticated multipart: audio, consent=1, optional durationMs.
 * Binds ElevenLabs voice_id to the signed-in profile. Recordings are not logged.
 */
export const Route = createFileRoute("/api/voice-enroll")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const origin = assertTranslateOrigin(request);
        if (!origin.ok) {
          return jsonSecure({ error: { code: origin.code, message: origin.message } }, { status: origin.status });
        }
        const auth = await requireAuthenticatedUser(request);
        if (!auth.ok) {
          return jsonSecure({ error: { code: auth.code, message: "Sign in to save your voice." } }, { status: 401 });
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

        const consent = String(form.get("consent") ?? "") === "1";
        if (!consent) {
          return jsonSecure(
            {
              error: {
                code: "CONSENT_REQUIRED",
                message: "Confirm that TIJAR may use this recording to create a synthetic voice.",
              },
            },
            { status: 400 },
          );
        }

        const audio = form.get("audio");
        if (!(audio instanceof Blob)) {
          return jsonSecure(
            { error: { code: "VALIDATION", message: "Record at least 8 seconds of clear speech." } },
            { status: 400 },
          );
        }
        const durationRaw = String(form.get("durationMs") ?? "");
        const durationMs = durationRaw ? Number(durationRaw) : null;
        const guard = await guardVoiceEnrollmentAudio(audio, Number.isFinite(durationMs) ? durationMs : null);
        if (!guard.ok) {
          return jsonSecure({ error: { code: guard.code, message: guard.message } }, { status: guard.status });
        }

        const name = String(form.get("name") ?? "TIJAR shopkeeper").slice(0, 80);
        const providerReady = requireVoiceCloneProvider();
        if (providerReady) {
          return jsonSecure(gatewayErrorResponse(providerReady), { status: providerReady.status });
        }
        const session = await startAiSession({ request, service: "voice_enroll" });
        if (!session.ok) {
          return jsonSecure(gatewayErrorResponse(session), { status: session.status });
        }
        const replayed = replayDuplicateAi(session);
        if (replayed) return replayed;

        try {
          const timed = await runTimedProvider(session, elevenLabsCloneVoice({ name, audio }));
          if (!timed.ok) {
            const timeoutBody = { error: { code: "TIMEOUT", message: "Voice enrolment timed out." } };
            await session.saveReplay({ httpStatus: 504, body: timeoutBody });
            await session.finish({ status: "failed", errorCode: "TIMEOUT", refund: session.refundOnTimeout });
            return jsonSecure(timeoutBody, { status: 504 });
          }
          const { voiceId } = timed.value;
          const bound = await bindAiVoice(request, voiceId, session.jobId);
          if (!bound) {
            const bindBody = { error: { code: "BIND_FAILED", message: "Could not attach this voice to your account." } };
            await session.saveReplay({ httpStatus: 503, body: bindBody });
            await session.finish({ status: "failed", errorCode: "BIND_FAILED" });
            return jsonSecure(bindBody, { status: 503 });
          }
          const okBody = { voiceId, provider: "elevenlabs" };
          await session.saveReplay({ httpStatus: 200, body: okBody });
          await session.finish({ status: "succeeded", provider: "elevenlabs" });
          return jsonSecure(okBody);
        } catch {
          const errBody = { error: { code: "PROVIDER_ERROR", message: "Could not create personal voice." } };
          await session.saveReplay({ httpStatus: 502, body: errBody });
          await session.finish({ status: "failed", errorCode: "PROVIDER_ERROR" });
          return jsonSecure(errBody, { status: 502 });
        }
      },
    },
  },
});
