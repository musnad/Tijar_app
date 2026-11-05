import { createFileRoute } from "@tanstack/react-router";

import { GRAPHICS_FRAMES, graphicsPrompt, type GraphicsFrame } from "@/lib/ai/seller-extract";
import {
  assertJsonContentType,
  assertTranslateOrigin,
  jsonSecure,
  readJsonBody,
  requireAuthenticatedUser,
} from "@/lib/nkenne/api-security";
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
        if (!isXaiConfigured()) {
          return jsonSecure({
            dataUrl: null,
            frame,
            source: "local",
            warning: "Grok image is not configured. TIJAR will still stamp your photo on a branded frame.",
          });
        }
        try {
          const prompt = graphicsPrompt({
            frame,
            businessName,
            productName: body.productName,
            locale: body.locale || "English",
          });
          const image = await grokGenerateImage({
            prompt,
            aspectRatio: "3:4",
            imageDataUrl: photo,
          });
          return jsonSecure({ dataUrl: image.dataUrl, frame, source: "grok" });
        } catch (err) {
          const message = err instanceof XaiError ? err.message : "Grok could not draw this poster.";
          return jsonSecure({
            dataUrl: null,
            frame,
            source: "local",
            warning: message,
          });
        }
      },
    },
  },
});
