import { slugifyBusinessName } from "@/utils/discover";

export type SeoKeywordLanguage = "ha" | "en";

export type SeoKeyword = {
  slug: string;
  language: SeoKeywordLanguage;
  /** Surface phrases used for matching shop text. Never invented beyond this list + admin aliases. */
  phrases: string[];
  englishLabel: string;
  hausaLabel: string;
  categorySlug: string;
  categoryName: string;
  heading: string;
  description: string;
};

/** Curated Hausa ↔ English maps onto existing `business_categories` slugs. */
export const SEO_KEYWORD_SEED: SeoKeyword[] = [
  {
    slug: "dan-wake",
    language: "ha",
    phrases: ["dan wake", "danwake", "dan-wake"],
    englishLabel: "Bean cake seller",
    hausaLabel: "Mai dan wake",
    categorySlug: "street-food",
    categoryName: "Street food & bukka",
    heading: "Dan wake sellers",
    description: "Local dan wake (bean cake) businesses on Tijar.",
  },
  {
    slug: "mai-faci",
    language: "ha",
    phrases: ["mai faci", "maifaci", "faci"],
    englishLabel: "Tailor",
    hausaLabel: "Mai faci",
    categorySlug: "tailoring",
    categoryName: "Tailoring & sewing",
    heading: "Mai faci (tailors)",
    description: "Tailors and sewing businesses listed as mai faci on Tijar.",
  },
  {
    slug: "tailors",
    language: "en",
    phrases: ["tailor", "tailoring", "sewing", "mai faci"],
    englishLabel: "Tailors",
    hausaLabel: "Mai faci",
    categorySlug: "tailoring",
    categoryName: "Tailoring & sewing",
    heading: "Tailors",
    description: "Tailors and sewing shops on Tijar.",
  },
  {
    slug: "mai-kayan-miya",
    language: "ha",
    phrases: ["kayan miya", "mai kayan miya", "kayanmiya"],
    englishLabel: "Vegetable seller",
    hausaLabel: "Mai kayan miya",
    categorySlug: "fresh-produce",
    categoryName: "Fresh produce",
    heading: "Mai kayan miya",
    description: "Vegetable and soup-ingredient sellers on Tijar.",
  },
  {
    slug: "vegetable-sellers",
    language: "en",
    phrases: ["vegetable", "vegetables", "kayan miya", "kayan lambu"],
    englishLabel: "Vegetable sellers",
    hausaLabel: "Mai kayan miya",
    categorySlug: "fresh-produce",
    categoryName: "Fresh produce",
    heading: "Vegetable sellers",
    description: "Fresh produce and vegetable vendors on Tijar.",
  },
  {
    slug: "mai-shayi",
    language: "ha",
    phrases: ["mai shayi", "shayi", "tea seller"],
    englishLabel: "Tea seller",
    hausaLabel: "Mai shayi",
    categorySlug: "snacks-drinks",
    categoryName: "Snacks & drinks",
    heading: "Mai shayi",
    description: "Tea sellers and snack stalls on Tijar.",
  },
  {
    slug: "mai-kayan-masarufi",
    language: "ha",
    phrases: ["kayan masarufi", "mai kayan masarufi", "provision"],
    englishLabel: "Provision seller",
    hausaLabel: "Mai kayan masarufi",
    categorySlug: "provision",
    categoryName: "Food & provisions",
    heading: "Mai kayan masarufi",
    description: "Provision and grocery shops on Tijar.",
  },
  {
    slug: "provision-shops",
    language: "en",
    phrases: ["provision", "provisions", "grocery", "kayan masarufi"],
    englishLabel: "Provision shops",
    hausaLabel: "Mai kayan masarufi",
    categorySlug: "provision",
    categoryName: "Food & provisions",
    heading: "Provision shops",
    description: "Provision and grocery shops on Tijar.",
  },
  {
    slug: "mai-gyaran-waya",
    language: "ha",
    phrases: ["gyaran waya", "mai gyaran waya", "phone repair"],
    englishLabel: "Phone repairer",
    hausaLabel: "Mai gyaran waya",
    categorySlug: "phone-repair",
    categoryName: "Phone repair",
    heading: "Mai gyaran waya",
    description: "Phone repair businesses on Tijar.",
  },
  {
    slug: "phone-repairers",
    language: "en",
    phrases: ["phone repair", "repairer", "gyaran waya"],
    englishLabel: "Phone repairers",
    hausaLabel: "Mai gyaran waya",
    categorySlug: "phone-repair",
    categoryName: "Phone repair",
    heading: "Phone repairers",
    description: "Phone repair shops on Tijar.",
  },
  {
    slug: "mai-gyaran-takalma",
    language: "ha",
    phrases: ["gyaran takalma", "mai gyaran takalma", "shoe repair"],
    englishLabel: "Shoe repairer",
    hausaLabel: "Mai gyaran takalma",
    categorySlug: "shoes-bags",
    categoryName: "Shoes & bags",
    heading: "Mai gyaran takalma",
    description: "Shoe repair and footwear businesses on Tijar.",
  },
  {
    slug: "mai-sayar-da-kayan-lambu",
    language: "ha",
    phrases: ["kayan lambu", "mai sayar da kayan lambu"],
    englishLabel: "Vegetable vendor",
    hausaLabel: "Mai sayar da kayan lambu",
    categorySlug: "fresh-produce",
    categoryName: "Fresh produce",
    heading: "Mai sayar da kayan lambu",
    description: "Garden-produce vendors on Tijar.",
  },
  {
    slug: "mai-sayar-da-kayan-sawa",
    language: "ha",
    phrases: ["kayan sawa", "mai sayar da kayan sawa"],
    englishLabel: "Clothing seller",
    hausaLabel: "Mai sayar da kayan sawa",
    categorySlug: "fashion",
    categoryName: "Fashion & clothes",
    heading: "Mai sayar da kayan sawa",
    description: "Clothing sellers on Tijar.",
  },
  {
    slug: "mai-aski",
    language: "ha",
    phrases: ["mai aski", "aski", "barber"],
    englishLabel: "Barber",
    hausaLabel: "Mai aski",
    categorySlug: "beauty",
    categoryName: "Beauty, salon & barbing",
    heading: "Mai aski",
    description: "Barbers on Tijar.",
  },
  {
    slug: "mai-gyaran-gashi",
    language: "ha",
    phrases: ["gyaran gashi", "mai gyaran gashi", "hairdresser"],
    englishLabel: "Hairdresser",
    hausaLabel: "Mai gyaran gashi",
    categorySlug: "beauty",
    categoryName: "Beauty, salon & barbing",
    heading: "Mai gyaran gashi",
    description: "Hairdressers and salons on Tijar.",
  },
];

export function keywordSlug(value: string): string {
  return slugifyBusinessName(value);
}

export function normalizePhrase(value: string): string {
  return value.toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

export function mergeKeywordLists(extra: SeoKeyword[] = []): SeoKeyword[] {
  const map = new Map<string, SeoKeyword>();
  for (const row of [...SEO_KEYWORD_SEED, ...extra]) {
    const slug = keywordSlug(row.slug);
    if (!slug) continue;
    const existing = map.get(slug);
    if (!existing) {
      map.set(slug, { ...row, slug });
      continue;
    }
    map.set(slug, {
      ...existing,
      ...row,
      slug,
      phrases: [...new Set([...existing.phrases, ...row.phrases].map(normalizePhrase).filter(Boolean))],
    });
  }
  return [...map.values()];
}

export function findKeyword(slug: string, extra: SeoKeyword[] = []): SeoKeyword | null {
  const want = keywordSlug(decodeURIComponent(slug));
  if (!want) return null;
  return mergeKeywordLists(extra).find((row) => row.slug === want) ?? null;
}

export function relatedKeywords(keyword: SeoKeyword, extra: SeoKeyword[] = []): SeoKeyword[] {
  return mergeKeywordLists(extra).filter((row) => row.slug !== keyword.slug && row.categorySlug === keyword.categorySlug);
}

export function haystackMatchesKeyword(haystack: string, keyword: SeoKeyword): boolean {
  const hay = normalizePhrase(haystack);
  if (!hay) return false;
  if (hay.includes(normalizePhrase(keyword.categoryName))) return true;
  if (hay.includes(keyword.categorySlug.replace(/-/g, " "))) return true;
  return keyword.phrases.some((phrase) => hay.includes(normalizePhrase(phrase)));
}

export function locationPageTitle(keyword: SeoKeyword, place: string): string {
  const where = place.trim() || "Nigeria";
  if (keyword.language === "ha") {
    return `${keyword.hausaLabel} in ${where} | Tijar.ng`;
  }
  return `${keyword.heading} in ${where} | Tijar.ng`;
}

export function locationPageDescription(keyword: SeoKeyword, place: string, count: number): string {
  const where = place.trim() || "Nigeria";
  const n = count > 0 ? ` ${count} local ${count === 1 ? "business" : "businesses"} listed.` : "";
  return `${keyword.description} Find ${keyword.englishLabel.toLowerCase()} in ${where} on Tijar.${n}`.replace(/\s+/g, " ").trim();
}
