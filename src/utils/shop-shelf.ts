/**
 * Turn OCR text from a shop-shelf / product-display photo into product drafts.
 * The owner only needs to fill cost + selling price before saving.
 */

export const PRODUCT_CATEGORIES = [
  "foodstuff",
  "drinks",
  "household",
  "personal_care",
  "electronics",
  "fashion",
  "pharmacy",
  "other",
] as const;

export type ProductCategoryId = (typeof PRODUCT_CATEGORIES)[number];

export type ShopShelfItem = {
  id: string;
  name: string;
  category: ProductCategoryId;
  unit: string;
  costPrice: string;
  salePrice: string;
  selected: boolean;
};

const NOISE =
  /^(total|subtotal|amount|price|naira|ngn|tel|phone|www|http|open|closed|welcome|thank|shop|store|market|aisle|shelf|promo|sale|off|%|kg|g|ml|l|pcs?|pack|x\d+)$/i;

const CATEGORY_KEYWORDS: { category: ProductCategoryId; words: RegExp }[] = [
  {
    category: "drinks",
    words:
      /\b(water|drink|soda|coke|coca[\s-]?cola|cola|fanta|sprite|pepsi|juice|milk|yoghurt|yogurt|beer|malt|tea|coffee|soft\s*drink|bottled)\b/i,
  },
  {
    category: "personal_care",
    words:
      /\b(soap|detergent|shampoo|cream|lotion|toothpaste|toothbrush|perfume|deodorant|pad|nappy|diaper|tissue|wipes|razor)\b/i,
  },
  {
    category: "household",
    words:
      /\b(broom|bucket|bowl|plate|cup|spoon|pot|pan|candle|match|battery|torch|bulb|soap\s*dish|mop|bleach|disinfectant)\b/i,
  },
  {
    category: "electronics",
    words:
      /\b(phone|charger|cable|earpiece|headset|radio|tv|fan|torch|power\s*bank|usb|sim|memory\s*card)\b/i,
  },
  {
    category: "fashion",
    words: /\b(shirt|trouser|dress|shoe|slipper|cap|bag|belt|sock|wrapper|ankara|fabric)\b/i,
  },
  {
    category: "pharmacy",
    words:
      /\b(paracetamol|panadol|antibiotic|vitamin|syrup|bandage|plaster|ointment|medicine|tablet|capsule)\b/i,
  },
  {
    category: "foodstuff",
    words:
      /\b(rice|beans|garri|gari|flour|oil|sugar|salt|maggi|seasoning|spice|pepper|tomato|onion|yam|potato|pasta|noodle|semo|semolina|wheat|maize|corn|milk\s*powder|biscuit|bread|egg|fish|meat|chicken|indomie|spaghetti|stew|sauce|groundnut|ground\s*nut|palm\s*oil|vegetable\s*oil)\b/i,
  },
];

const UNIT_HINTS: { unit: string; re: RegExp }[] = [
  { unit: "bag", re: /\bbags?\b/i },
  { unit: "carton", re: /\bcartons?\b/i },
  { unit: "kg", re: /\b\d+\s*kg\b|\bkg\b/i },
  { unit: "litre", re: /\b\d+\s*l(?:itre|iter)?s?\b|\blitres?\b|\bliters?\b/i },
  { unit: "yard", re: /\byards?\b|\byds?\b/i },
  { unit: "metre", re: /\bmetres?\b|\bmeters?\b|\bmtrs?\b/i },
];

function titleCase(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
    .slice(0, 80);
}

function cleanLine(line: string): string {
  return line
    .replace(/[|•·]+/g, " ")
    // Strip prices / sizes; match longer units first so "50kg" does not leave a stray "g"
    .replace(/(?:₦|ngn|naira)?\s*[\d,.]+(?:\.\d+)?\s*(?:kg|ml|litres?|liters?|pcs?|g|l|k)?\b/gi, " ")
    .replace(/[^\p{L}\p{N}\s\-'.]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function guessCategory(name: string): ProductCategoryId {
  for (const row of CATEGORY_KEYWORDS) {
    if (row.words.test(name)) return row.category;
  }
  return "other";
}

function guessUnit(name: string): string {
  for (const u of UNIT_HINTS) {
    if (u.re.test(name)) return u.unit;
  }
  return "piece";
}

function isLikelyProduct(name: string): boolean {
  if (name.length < 2 || name.length > 60) return false;
  if (NOISE.test(name)) return false;
  if (/^\d+$/.test(name)) return false;
  // Need at least one letter
  if (!/\p{L}/u.test(name)) return false;
  // Too many short gibberish tokens
  const words = name.split(/\s+/);
  if (words.length > 8) return false;
  return true;
}

function dedupeKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Extract product candidates from OCR text of a shop shelf photo.
 */
export function parseShopShelf(rawInput: string): ShopShelfItem[] {
  const raw = rawInput.trim();
  if (!raw) return [];

  const lines = raw
    .split(/\r?\n/)
    .map((l) => cleanLine(l))
    .filter(Boolean);

  // Also split dense single-line OCR on common separators
  const expanded: string[] = [];
  for (const line of lines) {
    if (line.includes(",") && line.length > 24) {
      expanded.push(...line.split(",").map((p) => cleanLine(p)).filter(Boolean));
    } else {
      expanded.push(line);
    }
  }

  const seen = new Set<string>();
  const items: ShopShelfItem[] = [];
  let i = 0;

  for (const line of expanded) {
    if (!isLikelyProduct(line)) continue;
    const name = titleCase(line);
    const key = dedupeKey(name);
    if (key.length < 2 || seen.has(key)) continue;
    // Near-duplicate: "Rice" vs "Rice 50kg"
    let nearDup = false;
    for (const existing of seen) {
      if (existing.includes(key) || key.includes(existing)) {
        if (Math.abs(existing.length - key.length) <= 4) {
          nearDup = true;
          break;
        }
      }
    }
    if (nearDup) continue;
    seen.add(key);

    items.push({
      id: `shelf-${Date.now()}-${i++}`,
      name,
      category: guessCategory(name),
      unit: guessUnit(name),
      costPrice: "",
      salePrice: "",
      selected: true,
    });

    if (items.length >= 40) break;
  }

  return items;
}

export function categoryNote(category: ProductCategoryId): string {
  return `Category: ${category}`;
}
