/** Phase 3: Hausa ↔ English is the first TIJAR Translate pair. No model training here. */

const HAUSA = "hausa";
const ENGLISH = "english";

export function isHausaEnglishPair(fromLanguage: string, toLanguage: string): boolean {
  const from = fromLanguage.trim().toLowerCase();
  const to = toLanguage.trim().toLowerCase();
  return (from === HAUSA && to === ENGLISH) || (from === ENGLISH && to === HAUSA);
}

/** Whole-word market terms vendors often mistranslate. Short / ambiguous words are omitted. */
const EN_TO_HA: Array<[RegExp, string]> = [
  [/\bhow much\b/gi, "nawa"],
  [/\bthank you\b/gi, "na gode"],
  [/\bplease\b/gi, "don Allah"],
  [/\bcustomer\b/gi, "abokin ciniki"],
  [/\bmarket\b/gi, "kasuwa"],
  [/\bprice\b/gi, "farashi"],
  [/\brice\b/gi, "shinkafa"],
  [/\bbeans\b/gi, "wake"],
  [/\bpepper sauce\b/gi, "miyar barkono"],
  [/\bcome again\b/gi, "koma kuma"],
];

const HA_TO_EN: Array<[RegExp, string]> = [
  [/\bnawa\b/gi, "how much"],
  [/\bna gode\b/gi, "thank you"],
  [/\bdon Allah\b/gi, "please"],
  [/\babokin ciniki\b/gi, "customer"],
  [/\bkasuwa\b/gi, "market"],
  [/\bfarashi\b/gi, "price"],
  [/\bshinkafa\b/gi, "rice"],
  [/\bwake\b/gi, "beans"],
  [/\bmiyar barkono\b/gi, "pepper sauce"],
];

export function tijarTranslateSystemPrompt(fromLanguage: string, toLanguage: string): string {
  const haEn = isHausaEnglishPair(fromLanguage, toLanguage);
  const extra = haEn
    ? " This pair is Hausa and Nigerian English for market traders. Keep ₦, numbers, measures (kg, bag, carton), and names. Prefer everyday Kano/Kaduna market Hausa, not formal literary Hausa."
    : "";
  return `You translate for TIJAR, a Nigerian marketplace. Translate from ${fromLanguage} to ${toLanguage}.${extra} Return only the translation — no quotes, no extra words. Preserve numbers and currency.`;
}

export function preserveShopTokens(source: string, translated: string): string {
  let out = translated.replace(/^["']|["']$/g, "").trim();
  const amounts = source.match(/₦\s?\d[\d,]*(?:\.\d+)?/g) ?? [];
  for (const token of amounts) {
    const compact = token.replace(/\s+/g, "");
    if (!out.includes(token) && !out.includes(compact) && !out.includes(token.replace(/\s/g, ""))) {
      out = `${out} ${compact}`.trim();
    }
  }
  return out.replace(/\s+/g, " ").trim();
}

export function applyHausaEnglishGlossary(
  text: string,
  fromLanguage: string,
  toLanguage: string,
): string {
  if (!isHausaEnglishPair(fromLanguage, toLanguage)) return text;
  const to = toLanguage.trim().toLowerCase();
  const pairs = to === HAUSA ? EN_TO_HA : HA_TO_EN;
  let out = text;
  for (const [pattern, replacement] of pairs) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

export function polishHausaEnglish(
  source: string,
  translated: string,
  fromLanguage: string,
  toLanguage: string,
): string {
  const glossed = applyHausaEnglishGlossary(translated, fromLanguage, toLanguage);
  return preserveShopTokens(source, glossed);
}
