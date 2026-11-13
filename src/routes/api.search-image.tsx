import { createFileRoute } from "@tanstack/react-router";

import { gatewayErrorResponse, replayDuplicateAi, runTimedProvider, startAiSession } from "@/lib/ai/gateway";
import {
  assertJsonContentType,
  assertTranslateOrigin,
  jsonSecure,
  readJsonBody,
} from "@/lib/api/security";
import { openaiVisionSearchQuery } from "@/lib/openai/client";

const MAX_BODY = 1_600_000;

/**
 * Paid OpenAI vision. Auth + usage required. Credit cost is 0 until a commercial price is approved
 * (proposed: 2 credits, same band as caption).
 */
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
        const image = typeof (parsed.body as { image?: unknown }).image === "string" ? (parsed.body as { image: string }).image : "";
        if (!image.startsWith("data:image/")) {
          return jsonSecure({ error: { code: "VALIDATION", message: "Send a product photo." } }, { status: 400 });
        }
        const session = await startAiSession({ request, service: "search_image" });
        if (!session.ok) {
          return jsonSecure(gatewayErrorResponse(session), { status: session.status });
        }
        const replayed = replayDuplicateAi(session);
        if (replayed) return replayed;
        try {
          const timed = await runTimedProvider(session, openaiVisionSearchQuery(image));
          if (!timed.ok) {
            const timeoutBody = { error: { code: "TIMEOUT", message: "Photo search timed out." } };
            await session.saveReplay({ httpStatus: 504, body: timeoutBody });
            await session.finish({ status: "failed", errorCode: "TIMEOUT", refund: session.refundOnTimeout });
            return jsonSecure(timeoutBody, { status: 504 });
          }
          const query = timed.value;
          if (!query) {
            const emptyBody = { error: { code: "EMPTY", message: "Could not tell what is in the photo." } };
            await session.saveReplay({ httpStatus: 422, body: emptyBody });
            await session.finish({ status: "failed", errorCode: "EMPTY" });
            return jsonSecure(emptyBody, { status: 422 });
          }
          const okBody = { query };
          await session.saveReplay({ httpStatus: 200, body: okBody });
          await session.finish({ status: "succeeded", provider: "openai" });
          return jsonSecure(okBody);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not read that photo.";
          const errBody = { error: { code: "PROVIDER_ERROR", message } };
          await session.saveReplay({ httpStatus: 502, body: errBody });
          await session.finish({ status: "failed", errorCode: "PROVIDER_ERROR" });
          return jsonSecure(errBody, { status: 502 });
        }
      },
    },
  },
});
