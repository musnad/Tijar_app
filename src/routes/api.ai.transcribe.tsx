import { createFileRoute } from "@tanstack/react-router";

import {
  assertTranslateOrigin,
  clientIp,
  jsonSecure,
  requireAuthenticatedUser,
} from "@/lib/api/security";
import { gatewayErrorResponse, replayDuplicateAi, runTimedProvider, startAiSession } from "@/lib/ai/gateway";
import { transcribeOrTranslateSpeech } from "@/lib/speech/service";

export const Route = createFileRoute("/api/ai/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const origin = assertTranslateOrigin(request);
        if (!origin.ok) {
          return jsonSecure({ error: { code: origin.code, message: origin.message } }, { status: origin.status });
        }
        const auth = await requireAuthenticatedUser(request);
        if (!auth.ok) {
          return jsonSecure({ error: { code: auth.code, message: "Sign in to use voice." } }, { status: auth.status });
        }
        const contentType = request.headers.get("content-type") ?? "";
        if (!contentType.includes("multipart/form-data")) {
          return jsonSecure(
            { error: { code: "UNSUPPORTED_MEDIA", message: "Send audio as multipart/form-data." } },
            { status: 415 },
          );
        }
        const form = await request.formData().catch(() => null);
        if (!form) {
          return jsonSecure({ error: { code: "VALIDATION", message: "Invalid voice request." } }, { status: 400 });
        }
        const file = form.get("audio") ?? form.get("audio_file");
        if (!(file instanceof File) && !(file instanceof Blob)) {
          return jsonSecure({ error: { code: "VALIDATION", message: "Audio recording is required." } }, { status: 400 });
        }
        const language = String(form.get("language") ?? "English").trim() || "English";
        const session = await startAiSession({ request, service: "stt" });
        if (!session.ok) {
          return jsonSecure(gatewayErrorResponse(session), { status: session.status });
        }
        const replayed = replayDuplicateAi(session);
        if (replayed) return replayed;
        const timed = await runTimedProvider(
          session,
          transcribeOrTranslateSpeech(
            { audio: file, language },
            { rateLimitKey: `ai-stt:${clientIp(request)}|${auth.userId}`, rateLimit: 20 },
          ),
        );
        if (!timed.ok) {
          const timeoutBody = { error: { code: "TIMEOUT", message: "Speech timed out." } };
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
        const okBody = { transcript: result.transcript, language: result.language };
        await session.saveReplay({ httpStatus: 200, body: okBody });
        await session.finish({ status: "succeeded" });
        return jsonSecure(okBody);
      },
    },
  },
});
