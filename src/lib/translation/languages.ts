/**
 * TIJAR language catalogue.
 *
 * Phase 3 Translate: Hausa ↔ English first. Optional TIJAR worker, then Grok, then ChatGPT.
 * Speak-back uses ElevenLabs / OpenAI. Those models are
 * prompt-driven, so the catalogue below is the single source of truth for
 * which languages the product exposes — Hausa is a first-class citizen.
 *
 * `whisper` is only set for languages the Whisper STT model documents; when
 * absent, Whisper is asked to auto-detect and the browser speech engine
 * (via `bcp47`) is used first.
 */

export type TijarLanguage = {
  /** Display name used across the app, DB rows, and API payloads. */
  name: string;
  /** ISO 639 code. */
  code: string;
  /** BCP-47 tag for browser SpeechSynthesis / SpeechRecognition. */
  bcp47: string;
  /** Whisper / TTS hint, only when the model documents the language. */
  whisper?: string;
  /** Grouping label used to order the UI lists. */
  region: string;
};

export const TIJAR_LANGUAGES = [
  // West Africa — Hausa and TIJAR's launch languages first.
  { name: "English", code: "en", bcp47: "en-NG", whisper: "en", region: "West Africa" },
  { name: "Hausa", code: "ha", bcp47: "ha-NG", whisper: "ha", region: "West Africa" },
  { name: "Yoruba", code: "yo", bcp47: "yo-NG", whisper: "yo", region: "West Africa" },
  { name: "Igbo", code: "ig", bcp47: "ig-NG", region: "West Africa" },
  { name: "Nigerian Pidgin", code: "pcm", bcp47: "en-NG", whisper: "en", region: "West Africa" },
  { name: "Fulfulde", code: "ff", bcp47: "ff-NG", region: "West Africa" },
  { name: "Kanuri", code: "kr", bcp47: "kr-NG", region: "West Africa" },
  { name: "Twi", code: "tw", bcp47: "tw-GH", region: "West Africa" },
  { name: "Ewe", code: "ee", bcp47: "ee-GH", region: "West Africa" },
  { name: "Ga", code: "gaa", bcp47: "gaa-GH", region: "West Africa" },
  { name: "Wolof", code: "wo", bcp47: "wo-SN", region: "West Africa" },
  { name: "Bambara", code: "bm", bcp47: "bm-ML", region: "West Africa" },
  { name: "Krio", code: "kri", bcp47: "kri-SL", region: "West Africa" },

  // East Africa
  { name: "Swahili", code: "sw", bcp47: "sw-KE", whisper: "sw", region: "East Africa" },
  { name: "Amharic", code: "am", bcp47: "am-ET", whisper: "am", region: "East Africa" },
  { name: "Somali", code: "so", bcp47: "so-SO", whisper: "so", region: "East Africa" },
  { name: "Oromo", code: "om", bcp47: "om-ET", region: "East Africa" },
  { name: "Tigrinya", code: "ti", bcp47: "ti-ET", region: "East Africa" },
  { name: "Kikuyu", code: "ki", bcp47: "ki-KE", region: "East Africa" },
  { name: "Kinyarwanda", code: "rw", bcp47: "rw-RW", region: "East Africa" },
  { name: "Kirundi", code: "rn", bcp47: "rn-BI", region: "East Africa" },
  { name: "Luganda", code: "lg", bcp47: "lg-UG", region: "East Africa" },
  { name: "Maasai", code: "mas", bcp47: "mas-KE", region: "East Africa" },

  // Central Africa
  { name: "Lingala", code: "ln", bcp47: "ln-CD", whisper: "ln", region: "Central Africa" },
  { name: "Kikongo", code: "kg", bcp47: "kg-CD", region: "Central Africa" },
  { name: "Sango", code: "sg", bcp47: "sg-CF", region: "Central Africa" },

  // Southern Africa
  { name: "Zulu", code: "zu", bcp47: "zu-ZA", region: "Southern Africa" },
  { name: "Xhosa", code: "xh", bcp47: "xh-ZA", region: "Southern Africa" },
  { name: "Shona", code: "sn", bcp47: "sn-ZW", whisper: "sn", region: "Southern Africa" },
  { name: "Ndebele", code: "nd", bcp47: "nd-ZW", region: "Southern Africa" },
  { name: "Sesotho", code: "st", bcp47: "st-ZA", region: "Southern Africa" },
  { name: "Setswana", code: "tn", bcp47: "tn-ZA", region: "Southern Africa" },
  { name: "Tsonga", code: "ts", bcp47: "ts-ZA", region: "Southern Africa" },
  { name: "Chichewa", code: "ny", bcp47: "ny-MW", region: "Southern Africa" },
  { name: "Afrikaans", code: "af", bcp47: "af-ZA", whisper: "af", region: "Southern Africa" },

  // North Africa
  { name: "Arabic", code: "ar", bcp47: "ar-SA", whisper: "ar", region: "North Africa" },
  { name: "Amazigh", code: "ber", bcp47: "ber-MA", region: "North Africa" },

  // Trade lingua francas
  { name: "French", code: "fr", bcp47: "fr-FR", whisper: "fr", region: "Trade" },
  { name: "Portuguese", code: "pt", bcp47: "pt-PT", whisper: "pt", region: "Trade" },
  { name: "Chinese", code: "zh", bcp47: "zh-CN", whisper: "zh", region: "Trade" },
  { name: "Hindi", code: "hi", bcp47: "hi-IN", whisper: "hi", region: "Trade" },
] as const satisfies readonly TijarLanguage[];

export type TijarLanguageName = (typeof TIJAR_LANGUAGES)[number]["name"];

/** Ordered display names — the safe list for any language picker. */
export const TIJAR_LANGUAGE_NAMES = TIJAR_LANGUAGES.map((l) => l.name) as TijarLanguageName[];

/** Compact picker for Talk, translator, and Discover. */
export const TIJAR_PICKER_LANGUAGES = [
  "English",
  "Hausa",
  "Yoruba",
  "Igbo",
  "Swahili",
  "Nigerian Pidgin",
  "Arabic",
  "Hindi",
  "Chinese",
] as const satisfies readonly TijarLanguageName[];

/** Compact chip label (native script where it helps). */
export const LANGUAGE_CHIP: Record<string, string> = {
  English: "EN",
  Hausa: "Hausa",
  Yoruba: "Yorùbá",
  Igbo: "Igbo",
  Swahili: "Kiswahili",
  "Nigerian Pidgin": "Pidgin",
  Arabic: "العربية",
  Hindi: "हिन्दी",
  Chinese: "中文",
  Fulfulde: "Fulfulde",
  French: "Français",
};

const BY_NAME = new Map<string, TijarLanguage>(TIJAR_LANGUAGES.map((l) => [l.name, l]));

export function isTijarLanguage(value: string): value is TijarLanguageName {
  return BY_NAME.has(value);
}

export function languageInfo(name: string): TijarLanguage | undefined {
  return BY_NAME.get(name);
}

/** BCP-47 tag for browser speech engines; defaults to Nigerian English. */
export function bcp47For(name: string): string {
  return BY_NAME.get(name)?.bcp47 ?? "en-NG";
}

/** Whisper language hint, or undefined to let the model auto-detect. */
export function whisperCodeFor(name: string): string | undefined {
  return BY_NAME.get(name)?.whisper;
}

/** TIJAR app locale -> language display name (all app locales are supported). */
const LOCALE_TO_LANGUAGE: Record<string, TijarLanguageName> = {
  en: "English",
  ha: "Hausa",
  yo: "Yoruba",
  ig: "Igbo",
  sw: "Swahili",
  ff: "Fulfulde",
  ar: "Arabic",
};

export function languageForLocale(locale: string): TijarLanguageName | null {
  return LOCALE_TO_LANGUAGE[locale] ?? null;
}
