import { createFileRoute } from "@tanstack/react-router";

import { fallbackSale, SALE_SYSTEM, type SaleExtract } from "@/lib/ai/seller-extract";
import {
  assertJsonContentType,
  assertTranslateOrigin,
  jsonSecure,
  readJsonBody,
  requireAuthenticatedUser,
} from "@/lib/nkenne/api-security";
import { grokJson, isXaiConfigured, XaiError } from "@/lib/xai/client";

export const Route = createFileRoute("/api/ai/sale")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const origin = assertTranslateOrigin(request);
        if (!origin.ok) {
          return jsonSecure({ error: { code: origin.code, message: origin.message } }, { status: origin.status });
        }
        const auth = await requireAuthenticatedUser(request);
        if (!auth.ok) {
          return jsonSecure({ error: { code: auth.code, message: "Sign in to record a sale." } }, { status: auth.status });
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
          return jsonSecure({ error: { code: "VALIDATION", message: "Say who bought what." } }, { status: 400 });
        }
        try {
          const sale = isXaiConfigured()
            ? await grokJson<SaleExtract>({
                system: SALE_SYSTEM,
                user: `Language hint: ${body.language || "English"}\nToday ISO: ${new Date().toISOString()}\n\nSeller said:\n${text.slice(0, 2000)}`,
              })
            : fallbackSale(text);
          return jsonSecure({ sale: sanitizeSale(sale, text), source: isXaiConfigured() ? "grok" : "local" });
        } catch (err) {
          const sale = sanitizeSale(fallbackSale(text), text);
          if (err instanceof XaiError && err.code === "NOT_CONFIGURED") {
            return jsonSecure({ sale, source: "local" });
          }
          return jsonSecure({ sale, source: "local", warning: "Grok was busy, so TIJAR used a simple extract." });
        }
      },
    },
  },
});

function sanitizeSale(raw: SaleExtract, text: string): SaleExtract {
  const fb = fallbackSale(text);
  return {
    customerName: (raw.customerName || fb.customerName).slice(0, 80),
    productName: raw.productName?.trim() || fb.productName,
    quantity: typeof raw.quantity === "number" && raw.quantity > 0 ? raw.quantity : fb.quantity,
    unit: raw.unit ?? fb.unit,
    priceNaira: typeof raw.priceNaira === "number" && raw.priceNaira > 0 ? raw.priceNaira : fb.priceNaira,
    onCredit: Boolean(raw.onCredit),
    occurredAt: raw.occurredAt || fb.occurredAt,
    notes: raw.notes ?? fb.notes,
  };
}
