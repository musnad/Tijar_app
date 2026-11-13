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
import { openaiGenerateImage } from "@/lib/openai/images";
import { gatewayErrorResponse, replayDuplicateAi, runTimedProvider, startAiSession, withAiTimeout } from "@/lib/ai/gateway";
import { grokGenerateImage, grokJson, isXaiConfigured, XaiError } from "@/lib/xai/client";

const MAX_BYTES = 3_500_000;

export const Route = createFileRoute("/api/studio/flyer")({
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
          priceLabel?: unknown;
        };
        const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 1200) : "";
        const productName = typeof body.productName === "string" ? body.productName.trim().slice(0, 80) : "";
        const businessName = typeof body.businessName === "string" ? body.businessName.trim().slice(0, 80) : "TIJAR shop";
        const style = typeof body.style === "string" ? body.style.trim().slice(0, 40) : "modern";
        const language = typeof body.language === "string" && body.language.trim() ? body.language.trim().slice(0, 40) : "English";
        const priceLabel = typeof body.priceLabel === "string" ? body.priceLabel.trim().slice(0, 40) : "";
        const imageDataUrl =
          typeof body.imageDataUrl === "string" && body.imageDataUrl.startsWith("data:image/") ? body.imageDataUrl : "";
        if (prompt.length < 4) {
          return jsonSecure({ error: { code: "VALIDATION", message: "Write what you want designed." } }, { status: 400 });
        }
        const session = await startAiSession({ request, service: "flyer" });
        if (!session.ok) {
          return jsonSecure(gatewayErrorResponse(session), { status: session.status });
        }
        const replayed = replayDuplicateAi(session);
        if (replayed) return replayed;

        let imaginePrompt = [
          prompt,
          productName ? `Sell ${productName} from ${businessName}.` : `Shop: ${businessName}.`,
          priceLabel ? `Show the price ${priceLabel} clearly.` : "",
          `Style: ${style}. Visible text language: ${language}. Keep the shopkeeper's wording.`,
          "Photoreal Nigerian market advert, 3:4 portrait, cinematic light, product hero, no extra logos.",
          "Navy #0B1F4D and green #1F7A4D unless the prompt names other colours.",
        ]
          .filter(Boolean)
          .join("\n");
        let caption = prompt;
        let captionHa = "";

        if (isXaiConfigured()) {
          try {
            const brief = await withAiTimeout(grokJson<{ imaginePrompt?: string; caption?: string; captionHa?: string }>({
              system:
                "You write Grok Imagine prompts for informal Nigerian shops on TIJAR. Return JSON only: imaginePrompt (one vivid paragraph for an advert photo, no watermarks), caption (For You post, max 220 chars, keep numbers and ₦), captionHa (Hausa version of the caption).",
              user: `Language: ${language}\nShop: ${businessName}\nProduct: ${productName || "shop item"}\nPrice: ${priceLabel || "none"}\nSeller prompt:\n${prompt}`,
            }), 12_000);
            if (brief.imaginePrompt?.trim()) imaginePrompt = brief.imaginePrompt.trim().slice(0, 1800);
            if (brief.caption?.trim()) caption = brief.caption.trim().slice(0, 280);
            if (brief.captionHa?.trim()) captionHa = brief.captionHa.trim().slice(0, 280);
          } catch {
            /* use the seller prompt as-is */
        }
        try {
            const timedImg = await runTimedProvider(
              session,
              grokGenerateImage({
                prompt: imaginePrompt,
                aspectRatio: "3:4",
                imageDataUrl: imageDataUrl || undefined,
              }),
            );
            if (!timedImg.ok) {
              const timeoutBody = { error: { code: "TIMEOUT", message: "Flyer timed out." } };
              await session.saveReplay({ httpStatus: 504, body: timeoutBody });
              await session.finish({ status: "failed", errorCode: "TIMEOUT", refund: session.refundOnTimeout });
              return jsonSecure(timeoutBody, { status: 504 });
            }
            const img = timedImg.value;
            const grokBody = {
              fallback: false,
              grok: true,
              dataUrl: img.dataUrl,
              caption,
              captionHa,
            };
            await session.saveReplay({ httpStatus: 200, body: grokBody });
            await session.finish({ status: "succeeded", provider: "xai" });
            return jsonSecure(grokBody);
        } catch (err) {
            if (err instanceof XaiError && err.code === "INVALID_CREDENTIALS") {
              const credBody = { error: { code: err.code, message: err.message }, fallback: true, grok: true };
              await session.saveReplay({ httpStatus: 502, body: credBody });
              await session.finish({ status: "failed", errorCode: "INVALID_CREDENTIALS" });
              return jsonSecure(credBody, { status: 502 });
            }
          }
        }

        const openai = await openaiGenerateImage(imaginePrompt);
        if (openai?.dataUrl) {
          const openaiBody = { fallback: false, grok: false, dataUrl: openai.dataUrl, caption, captionHa };
          await session.saveReplay({ httpStatus: 200, body: openaiBody });
          await session.finish({ status: "succeeded", provider: "openai" });
          return jsonSecure(openaiBody);
        }

        const failBody = { fallback: true, grok: isXaiConfigured(), caption, captionHa };
        await session.saveReplay({ httpStatus: 200, body: failBody });
        await session.finish({ status: "failed", errorCode: "PROVIDER_ERROR", provider: "local" });
        return jsonSecure(failBody);
      },
    },
  },
});
