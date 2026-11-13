import { createFileRoute } from "@tanstack/react-router";

import { GRAPHICS_FRAMES, graphicsPrompt, type GraphicsFrame } from "@/lib/ai/seller-extract";
import {
  assertJsonContentType,
  assertTranslateOrigin,
  jsonSecure,
  readJsonBody,
  requireAuthenticatedUser,
} from "@/lib/api/security";
import { gatewayErrorResponse, replayDuplicateAi, runTimedProvider, startAiSession } from "@/lib/ai/gateway";
import { grokGenerateImage, isXaiConfigured, XaiError } from "@/lib/xai/client";

const MAX_BODY = 3_500_000;

export const Route = createFileRoute("/api/ai/graphics")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const origin = assertTranslateOrigin(request);
        if (!origin.ok) {
          return jsonSecure({ error: { code: origin.code, message: origin.message } }, { status: origin.status });
        }
        const auth = await requireAuthenticatedUser(request);
        if (!auth.ok) {
          return jsonSecure({ error: { code: auth.code, message: "Sign in to make a poster." } }, { status: auth.status });
        }
        const media = assertJsonContentType(request);
        if (!media.ok) {
          return jsonSecure({ error: { code: media.code, message: media.message } }, { status: media.status });
        }
        const parsed = await readJsonBody(request, MAX_BODY);
        if (!parsed.ok) {
          return jsonSecure({ error: { code: parsed.code, message: parsed.message } }, { status: parsed.status });
        }
        const body = parsed.body as {
          frame?: string;
          businessName?: string;
          productName?: string | null;
          photoDataUrl?: string | null;
          locale?: string;
        };
        const frame = GRAPHICS_FRAMES.includes(body.frame as GraphicsFrame)
          ? (body.frame as GraphicsFrame)
          : "spotlight";
        const businessName = (body.businessName || "TIJAR shop").slice(0, 80);
        const photo =
          typeof body.photoDataUrl === "string" && body.photoDataUrl.startsWith("data:image/")
            ? body.photoDataUrl.slice(0, 2_800_000)
            : undefined;
        const session = await startAiSession({ request, service: "graphics" });
        if (!session.ok) {
          return jsonSecure(gatewayErrorResponse(session), { status: session.status });
        }
        const replayed = replayDuplicateAi(session);
        if (replayed) return replayed;
        if (!isXaiConfigured()) {
          const localBody = {
            dataUrl: null,
            frame,
            source: "local",
            warning: "Grok image is not configured. TIJAR will still stamp your photo on a branded frame.",
          };
          await session.saveReplay({ httpStatus: 200, body: localBody });
          await session.finish({ status: "succeeded", provider: "local" });
          return jsonSecure(localBody);
        }
        try {
          const prompt = graphicsPrompt({
            frame,
            businessName,
            productName: body.productName,
            locale: body.locale || "English",
          });
          const timed = await runTimedProvider(
            session,
            grokGenerateImage({
              prompt,
              aspectRatio: "3:4",
              imageDataUrl: photo,
            }),
          );
          if (!timed.ok) {
            const timeoutBody = { error: { code: "TIMEOUT", message: "Image generation timed out." } };
            await session.saveReplay({ httpStatus: 504, body: timeoutBody });
            await session.finish({ status: "failed", errorCode: "TIMEOUT", refund: session.refundOnTimeout });
            return jsonSecure(timeoutBody, { status: 504 });
          }
          const image = timed.value;
          const okBody = { dataUrl: image.dataUrl, frame, source: "grok" };
          await session.saveReplay({ httpStatus: 200, body: okBody });
          await session.finish({ status: "succeeded", provider: "xai" });
          return jsonSecure(okBody);
        } catch (err) {
          const message = err instanceof XaiError ? err.message : "Grok could not draw this poster.";
          const warnBody = { dataUrl: null, frame, source: "local", warning: message };
          await session.saveReplay({ httpStatus: 200, body: warnBody });
          await session.finish({ status: "failed", errorCode: "PROVIDER_ERROR", provider: "xai" });
          return jsonSecure(warnBody);
        }
      },
    },
  },
});
