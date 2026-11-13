import { createFileRoute } from "@tanstack/react-router";

import { fallbackListing, LISTING_SYSTEM, type ListingExtract } from "@/lib/ai/seller-extract";
import {
  assertJsonContentType,
  assertTranslateOrigin,
  jsonSecure,
  readJsonBody,
  requireAuthenticatedUser,
} from "@/lib/api/security";
import { gatewayErrorResponse, replayDuplicateAi, runTimedProvider, startAiSession } from "@/lib/ai/gateway";
import { grokJson, isXaiConfigured, XaiError } from "@/lib/xai/client";

export const Route = createFileRoute("/api/ai/listing")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const origin = assertTranslateOrigin(request);
        if (!origin.ok) {
          return jsonSecure({ error: { code: origin.code, message: origin.message } }, { status: origin.status });
        }
        const auth = await requireAuthenticatedUser(request);
        if (!auth.ok) {
          return jsonSecure({ error: { code: auth.code, message: "Sign in to create a listing." } }, { status: auth.status });
        }
        const media = assertJsonContentType(request);
        if (!media.ok) {
          return jsonSecure({ error: { code: media.code, message: media.message } }, { status: media.status });
        }
        const parsed = await readJsonBody(request, 16_384);
        if (!parsed.ok) {
          return jsonSecure({ error: { code: parsed.code, message: parsed.message } }, { status: parsed.status });
        }
        const body = parsed.body as { text?: string; language?: string };
        const text = typeof body.text === "string" ? body.text.trim() : "";
        if (text.length < 3) {
          return jsonSecure({ error: { code: "VALIDATION", message: "Say or type what you sell." } }, { status: 400 });
        }
        const session = await startAiSession({ request, service: "listing" });
        if (!session.ok) {
          return jsonSecure(gatewayErrorResponse(session), { status: session.status });
        }
        const replayed = replayDuplicateAi(session);
        if (replayed) return replayed;
        try {
          const listing = isXaiConfigured()
            ? await (async () => {
                const timed = await runTimedProvider(
                  session,
                  grokJson<ListingExtract>({
                    system: LISTING_SYSTEM,
                    user: `Language hint: ${body.language || "English"}\n\nSeller said:\n${text.slice(0, 2000)}`,
                  }),
                );
                if (!timed.ok) throw Object.assign(new Error("timeout"), { code: "TIMEOUT" });
                return timed.value;
              })()
            : fallbackListing(text);
          const cleaned = sanitizeListing(listing, text);
          const okBody = { listing: cleaned, source: isXaiConfigured() ? "grok" : "local" };
          await session.saveReplay({ httpStatus: 200, body: okBody });
          await session.finish({ status: "succeeded", provider: isXaiConfigured() ? "xai" : "local" });
          return jsonSecure(okBody);
        } catch (err) {
          if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "TIMEOUT") {
            const timeoutBody = { error: { code: "TIMEOUT", message: "TIJAR AI timed out." } };
            await session.saveReplay({ httpStatus: 504, body: timeoutBody });
            await session.finish({ status: "failed", errorCode: "TIMEOUT", refund: session.refundOnTimeout });
            return jsonSecure(timeoutBody, { status: 504 });
          }
          const listing = fallbackListing(text);
          if (err instanceof XaiError && err.code === "NOT_CONFIGURED") {
            const localBody = { listing, source: "local" };
            await session.saveReplay({ httpStatus: 200, body: localBody });
            await session.finish({ status: "succeeded", provider: "local" });
            return jsonSecure(localBody);
          }
          const warnBody = {
            listing: sanitizeListing(listing, text),
            source: "local",
            warning: "Grok was busy, so TIJAR used a simple extract.",
          };
          await session.saveReplay({ httpStatus: 200, body: warnBody });
          await session.finish({ status: "succeeded", provider: "local" });
          return jsonSecure(warnBody);
        }
      },
    },
  },
});

function sanitizeListing(raw: ListingExtract, fallbackText: string): ListingExtract {
  const fb = fallbackListing(fallbackText);
  const unit = ["piece", "bag", "carton", "kg", "litre", "yard", "metre"].includes(raw.unit) ? raw.unit : fb.unit;
  return {
    productName: (raw.productName || fb.productName).slice(0, 120),
    unit,
    quantity: typeof raw.quantity === "number" && raw.quantity > 0 ? raw.quantity : fb.quantity,
    priceNaira: typeof raw.priceNaira === "number" && raw.priceNaira > 0 ? raw.priceNaira : fb.priceNaira,
    descriptionEn: (raw.descriptionEn || fb.descriptionEn).slice(0, 2000),
    descriptionHa: (raw.descriptionHa || fb.descriptionHa).slice(0, 2000),
    location: raw.location?.trim() || fb.location,
    notes: raw.notes?.trim() || fb.notes,
  };
}
