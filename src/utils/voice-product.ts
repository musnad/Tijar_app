/**
 * Parse spoken / typed commands into a product draft.
 * Examples:
 *  "add product rice 50kg sell 15000 cost 12000 stock 20"
 *  "new service haircut for 2500"
 *  "bags of beans selling price 45000 cost 38000 I have 8"
 */

export type VoiceProductDraft = {
  name: string;
  kind: "goods" | "service";
  unit: string;
  salePrice: string;
  costPrice: string;
  initialStock: string;
  raw: string;
  confidence: "high" | "low";
};

const AMOUNT_RE = /(\d{1,3}(?:[,\s]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(k|thousand)?\b/i;
const UNITS = [
  "piece",
  "bag",
  "bags",
  "carton",
  "cartons",
  "kg",
  "kilo",
  "kilogram",
  "litre",
  "liter",
  "yard",
  "yards",
  "metre",
  "meter",
  "metres",
  "meters",
  "job",
] as const;

function amountToString(num: string, suffix?: string): string {
  let value = Number.parseFloat(num.replace(/[,\s]/g, ""));
  if (!Number.isFinite(value)) return "";
  const s = suffix?.toLowerCase();
  if (s === "k" || s === "thousand") value *= 1_000;
  return String(Math.round(value * 100) / 100);
}

function pickAmountAfter(text: string, keywords: RegExp): string {
  const m = text.match(new RegExp(`(?:${keywords.source})\\s*(?:is|=|:|of|at|for)?\\s*(?:₦|ngn|naira\\s*)?${AMOUNT_RE.source}`, "i"));
  if (m?.[1]) return amountToString(m[1], m[2]);
  return "";
}

function normalizeUnit(raw: string): string {
  const u = raw.toLowerCase();
  if (u.startsWith("bag")) return "bag";
  if (u.startsWith("carton")) return "carton";
  if (u.startsWith("kg") || u.startsWith("kilo")) return "kg";
  if (u.startsWith("lit")) return "litre";
  if (u.startsWith("yard")) return "yard";
  if (u.startsWith("metr") || u === "meter") return "metre";
  if (u === "job") return "job";
  return "piece";
}

export function parseVoiceProduct(rawInput: string): VoiceProductDraft {
  const raw = rawInput.trim();
  const text = raw.toLowerCase();

  const kind: "goods" | "service" = /\b(service|job|haircut|repair|sewing)\b/i.test(text)
    ? "service"
    : "goods";

  const salePrice =
    pickAmountAfter(text, /sell(?:ing)?(?:\s+price)?|sale\s+price|price|charge|for/) ||
    "";
  const costPrice = pickAmountAfter(text, /cost(?:\s+price)?|buy(?:ing)?(?:\s+price)?|bought(?:\s+at)?|wholesale/);
  const initialStock =
    kind === "goods"
      ? pickAmountAfter(text, /stock|quantity|qty|have|on\s+hand|count|opening/)
      : "";

  // Prefer "sell for X" style amount as sale when salePrice empty but a lone amount exists with "for"
  let sale = salePrice;
  if (!sale) {
    const forAmt = text.match(new RegExp(`for\\s+(?:₦|ngn|naira\\s*)?${AMOUNT_RE.source}`, "i"));
    if (forAmt?.[1]) sale = amountToString(forAmt[1], forAmt[2]);
  }

  let unit = "piece";
  for (const u of UNITS) {
    if (new RegExp(`\\b${u}\\b`, "i").test(text)) {
      unit = normalizeUnit(u);
      break;
    }
  }
  if (kind === "service") unit = "job";

  let name = raw
    .replace(new RegExp(AMOUNT_RE.source, "gi"), " ")
    .replace(/\b(add|new|product|products|item|goods|service|please|tijar|record|create)\b/gi, " ")
    .replace(/\b(sell(?:ing)?(?:\s+price)?|sale\s+price|price|charge|cost(?:\s+price)?|buy(?:ing)?(?:\s+price)?|bought(?:\s+at)?|wholesale|stock|quantity|qty|have|on\s+hand|count|opening|for|of|the|a|an|is|=|:|at|naira|ngn|₦)\b/gi, " ")
    .replace(new RegExp(`\\b(${UNITS.join("|")})\\b`, "gi"), " ")
    .replace(/\s+/g, " ")
    .trim();

  // Capitalize first letter of each word for display
  if (name) {
    name = name
      .split(" ")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  const confidence: "high" | "low" =
    name.length >= 2 && (sale !== "" || costPrice !== "" || initialStock !== "") ? "high" : name.length >= 2 ? "low" : "low";

  return {
    name: name.slice(0, 80),
    kind,
    unit,
    salePrice: sale,
    costPrice,
    initialStock,
    raw,
    confidence,
  };
}
