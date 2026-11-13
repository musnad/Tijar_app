import { createFileRoute } from "@tanstack/react-router";

import { CAPTION_SYSTEM, fallbackCaption, type CaptionExtract } from "@/lib/ai/seller-extract";
import {
  assertJsonContentType,
  assertTranslateOrigin,
  jsonSecure,
  readJsonBody,
  requireAuthenticatedUser,
} from "@/lib/api/security";
import { gatewayErrorResponse, replayDuplicateAi, runTimedProvider, startAiSession } from "@/lib/ai/gateway";
import { grokJson, isXaiConfigured, XaiError } from "@/lib/xai/client";

export const Route = createFileRoute("/api/ai/caption")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const origin = assertTranslateOrigin(request);
        if (!origin.ok) {
          return jsonSecure({ error: { code: origin.code, message: origin.message } }, { status: origin.status });
        }
        const auth = await requireAuthenticatedUser(request);
        if (!auth.ok) {
          return jsonSecure({ error: { code: auth.code, message: "Sign in to write a description." } }, { status: auth.status });
        }
        const media = assertJsonContentType(request);
        if (!media.ok) {
          return jsonSecure({ error: { code: media.code, message: media.message } }, { status: media.status });
        }
        const parsed = await readJsonBody(request, 16_384);
        if (!parsed.ok) {
          return jsonSecure({ error: { code: parsed.code, message: parsed.message } }, { status: parsed.status });
        }
        const body = parsed.body as {
          name?: string;
          price?: number | null;
          location?: string | null;
          language?: string;
        };
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (name.length < 2) {
          return jsonSecure({ error: { code: "VALIDATION", message: "Add a product name first." } }, { status: 400 });
        }
        const seed = {
          name,
          price: typeof body.price === "number" ? body.price : null,
          location: body.location ?? null,
        };
        const session = await startAiSession({ request, service: "caption" });
        if (!session.ok) {
          return jsonSecure(gatewayErrorResponse(session), { status: session.status });
        }
        const replayed = replayDuplicateAi(session);
        if (replayed) return replayed;
        try {
          let caption: CaptionExtract;
          if (isXaiConfigured()) {
            const timed = await runTimedProvider(
              session,
              grokJson<CaptionExtract>({
                system: CAPTION_SYSTEM,
                user: JSON.stringify({ ...seed, language: body.language || "English" }),
              }),
            );
            if (!timed.ok) {
              const timeoutBody = { error: { code: "TIMEOUT", message: "TIJAR AI timed out." } };
              await session.saveReplay({ httpStatus: 504, body: timeoutBody });
              await session.finish({ status: "failed", errorCode: "TIMEOUT", refund: session.refundOnTimeout });
              return jsonSecure(timeoutBody, { status: 504 });
            }
            caption = timed.value;
          } else {
            caption = fallbackCaption(seed);
          }
          const okBody = {
            caption: {
              english: (caption.english || fallbackCaption(seed).english).slice(0, 2000),
              hausa: (caption.hausa || fallbackCaption(seed).hausa).slice(0, 2000),
              caption: (caption.caption || fallbackCaption(seed).caption).slice(0, 400),
            },
            source: isXaiConfigured() ? "grok" : "local",
          };
          await session.saveReplay({ httpStatus: 200, body: okBody });
          await session.finish({ status: "succeeded", provider: isXaiConfigured() ? "xai" : "local" });
          return jsonSecure(okBody);
        } catch (err) {
          const caption = fallbackCaption(seed);
          if (err instanceof XaiError && err.code === "NOT_CONFIGURED") {
            const localBody = { caption, source: "local" };
            await session.saveReplay({ httpStatus: 200, body: localBody });
            await session.finish({ status: "succeeded", provider: "local" });
            return jsonSecure(localBody);
          }
          const warnBody = { caption, source: "local", warning: "Grok was busy, so TIJAR wrote a simple description." };
          await session.saveReplay({ httpStatus: 200, body: warnBody });
          await session.finish({ status: "succeeded", provider: "local" });
          return jsonSecure(warnBody);
        }
      },
    },
  },
});
