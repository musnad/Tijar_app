export type ListingExtract = {
  productName: string;
  unit: string;
  quantity: number | null;
  priceNaira: number | null;
  descriptionEn: string;
  descriptionHa: string;
  location: string | null;
  notes: string | null;
};

export type SaleExtract = {
  customerName: string;
  productName: string | null;
  quantity: number;
  unit: string | null;
  priceNaira: number | null;
  onCredit: boolean;
  occurredAt: string | null;
  notes: string | null;
};

export type CaptionExtract = {
  english: string;
  hausa: string;
  caption: string;
};

export type ReportCopy = {
  tipEn: string;
  tipHa: string;
  summaryEn: string;
  summaryHa: string;
};

export const LISTING_SYSTEM = `You extract a product listing for TIJAR, a Nigerian informal marketplace.
The seller may speak Hausa or English (or mix).
Return JSON only with keys:
productName (string), unit (piece|bag|carton|kg|litre|yard|metre), quantity (number or null),
priceNaira (number or null, naira only), descriptionEn (1-2 short trustworthy sentences),
descriptionHa (same meaning in simple Hausa), location (market/area or null), notes (null or extra).
Clean the product name. Do not invent a price. If no location, use null.`;

export const SALE_SYSTEM = `You extract a sale or credit record for TIJAR bookkeeping.
The seller may speak Hausa or English.
Return JSON only with keys:
customerName (string), productName (string or null), quantity (number, default 1),
unit (string or null), priceNaira (number or null), onCredit (boolean),
occurredAt (ISO date-time or null), notes (string or null).
"on credit", "bashi", "ta ɗauka", "took" without cash = onCredit true.
"yesterday" / "jiya" = yesterday 12:00 local Africa/Lagos.
Do not invent a customer name. If missing, use "Customer".`;

export const CAPTION_SYSTEM = `You write product copy for TIJAR informal sellers in Nigeria.
Keep it honest, simple, and trustworthy. No slang tricks, no fake discounts.
Return JSON: english (2-4 sentences), hausa (same meaning, simple Hausa), caption (one social line, English then Hausa separated by ·).`;

export const REPORT_SYSTEM = `You advise a Nigerian informal seller in very simple words.
Given weekly numbers, write JSON:
summaryEn, summaryHa (2 short sentences), tipEn, tipHa (one practical tip to sell more this week).
Never invent extra numbers. If views or sales are low, say record every sale and tell nearby customers.`;

export function fallbackListing(text: string): ListingExtract {
  const compact = text.replace(/,/g, "");
  const price =
    firstNumber(compact, /(\d{3,7})\s*(naira|ngn)\b/i) ??
    firstNumber(compact, /(?:₦|ngn)\s*(\d{3,7})/i) ??
    firstNumber(compact, /(₦|naira|ngn)?\s*(\d{3,7})\s*(naira|ngn)?/i);
  const grams = text.match(/(\d+(?:\.\d+)?)\s*(kg|kilo|grams?|g\b|litre|liter|bottles?|bags?)/i);
  const loc = text.match(/\b(?:in|a|at)\s+([^.,]+(?:market|gari|road|street|junction)[^.,]*)/i);
  const name = text
    .replace(/i sell|ina sayar|na sayar da/i, "")
    .replace(/\d+.*/g, " ")
    .replace(/naira|₦/gi, "")
    .trim()
    .slice(0, 80);
  const productName = name.split(/[,.]/)[0]?.trim() || "Product";
  const unit = /yard/i.test(text)
    ? "yard"
    : /metre|meter/i.test(text)
      ? "metre"
      : /kg|kilo/i.test(text)
        ? "kg"
        : /litre|liter/i.test(text)
          ? "litre"
          : /bag/i.test(text)
            ? "bag"
            : "piece";
  return {
    productName,
    unit,
    quantity: grams ? Number(grams[1]) : null,
    priceNaira: price,
    descriptionEn: `${productName} available now${loc ? ` in ${loc[1].trim()}` : ""}.`,
    descriptionHa: `Ana sayar da ${productName}${loc ? ` a ${loc[1].trim()}` : ""}.`,
    location: loc?.[1]?.trim() ?? null,
    notes: grams ? `${grams[1]} ${grams[2]}` : null,
  };
}

export function fallbackSale(text: string, now = new Date()): SaleExtract {
  const onCredit = /credit|bashi|bashin|ta ɗauka|ta dauka|on loan|owe/i.test(text);
  const yesterday = /yesterday|jiya/i.test(text);
  const qty = firstNumber(text, /(\d+(?:\.\d+)?)\s*(bottles?|bags?|pieces?|kg|cartons?)?/i) ?? 1;
  const price = firstNumber(text.replace(/,/g, ""), /(₦|naira)?\s*(\d{2,7})\s*(naira)?/i);
  const nameMatch = text.match(/^(?:[A-ZÀ-ÿ][\p{L}'-]+)/u) || text.match(/^(\p{L}+)/u);
  let occurredAt: string | null = null;
  if (yesterday) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    d.setHours(12, 0, 0, 0);
    occurredAt = d.toISOString();
  }
  const productBit = text.replace(/^.*?took\s+/i, "").replace(/yesterday.*$/i, "").trim();
  return {
    customerName: nameMatch?.[0]?.trim() || "Customer",
    productName: productBit.slice(0, 80) || null,
    quantity: qty,
    unit: null,
    priceNaira: price,
    onCredit,
    occurredAt,
    notes: text.slice(0, 200),
  };
}

export function fallbackCaption(input: { name: string; price?: number | null; location?: string | null }): CaptionExtract {
  const price = input.price != null ? `₦${Math.round(input.price).toLocaleString("en-NG")}` : "";
  const loc = input.location ? ` in ${input.location}` : "";
  const english = `${input.name} is ready for customers${loc}. ${price ? `Price: ${price}. ` : ""}Honest quality from a TIJAR seller. Message to order.`;
  const hausa = `${input.name} yana nan don abokan ciniki${input.location ? ` a ${input.location}` : ""}. ${price ? `Farashi: ${price}. ` : ""}Ingane, ka tuntuɓe don oda.`;
  return {
    english,
    hausa,
    caption: `${input.name}${price ? ` · ${price}` : ""} · TIJAR · ${hausa.split(".")[0]}.`,
  };
}

export function fallbackReport(stats: {
  profileViews: number;
  callClicks: number;
  whatsappClicks: number;
  salesTotal: number;
  salesCount: number;
}): ReportCopy {
  const quiet = stats.profileViews < 5 && stats.salesCount < 3;
  const tipEn = quiet
    ? "Tell 5 nearby customers that your shop is on TIJAR, and record every sale the same day."
    : "Reply fast on WhatsApp, keep one popular item in stock, and post a clear photo this week.";
  const tipHa = quiet
    ? "Gaya wa abokan ciniki 5 da ke kusa cewa shagonka yana TIJAR, kuma rubuta kowace sayarwa a rana guda."
    : "Amsa WhatsApp da sauri, kiyaye kaya da ake so, kuma saka hoto mai kyau wannan makon.";
  return {
    summaryEn: `This week: ${stats.profileViews} profile views, ${stats.callClicks + stats.whatsappClicks} call/WhatsApp taps, and ${stats.salesCount} sales recorded (₦${Math.round(stats.salesTotal).toLocaleString("en-NG")}).`,
    summaryHa: `Wannan mako: mutane ${stats.profileViews} sun kalli shagonka, ${stats.callClicks + stats.whatsappClicks} sun taɓa kira/WhatsApp, kuma an rubuta sayarwa ${stats.salesCount} (₦${Math.round(stats.salesTotal).toLocaleString("en-NG")}).`,
    tipEn,
    tipHa,
  };
}

export const GRAPHICS_FRAMES = ["spotlight", "week", "feature"] as const;
export type GraphicsFrame = (typeof GRAPHICS_FRAMES)[number];

export function graphicsPrompt(input: {
  frame: GraphicsFrame;
  businessName: string;
  productName?: string | null;
  locale: string;
}): string {
  const titles = {
    spotlight: "BUSINESS SPOTLIGHT",
    week: "BUSINESS OF THE WEEK",
    feature: "PRODUCT FEATURE",
  };
  return [
    `Create a vertical 3:4 social media poster for TIJAR, a Nigerian informal marketplace.`,
    `Brand colors: navy #0A2540 and green #00B86B, white text, clean and trustworthy.`,
    `Title: ${titles[input.frame]}. Shop name: ${input.businessName}.`,
    input.productName ? `Feature this product: ${input.productName}.` : "Feature the shop, not a fake product.",
    `Leave a large empty rounded photo window in the center for the seller's real photo overlay.`,
    `Include a small TIJAR wordmark. No extra logos. No fake phone numbers. Language: ${input.locale}.`,
    `High-end but simple. Ready for WhatsApp status.`,
  ].join(" ");
}

function firstNumber(text: string, re: RegExp): number | null {
  const m = text.match(re);
  if (!m) return null;
  for (const g of m.slice(1)) {
    const n = Number(String(g ?? "").replace(/[^\d.]/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}
