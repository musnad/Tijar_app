import type { Locale } from "@/lib/i18n/types";
import { formatNgn } from "@/utils/money";

export type StudioGoal = "sales" | "awareness" | "engage" | "launch";
export type StudioStyle = "modern" | "minimal" | "luxury" | "friendly";

export type StudioDraft = {
  caption: string;
  hashtags: string[];
  cta: string;
  script: string;
  source: "catalogue";
};

const GOAL_HOOK: Record<Locale, Record<StudioGoal, string>> = {
  en: {
    sales: "Ready when you are.",
    awareness: "Meet the product shops keep asking about.",
    engage: "Tell us how you would use this.",
    launch: "Just landed in the catalogue.",
  },
  ha: {
    sales: "Shirye take idan ka shirya.",
    awareness: "Ga samfurin da kasuwanni ke tambaya.",
    engage: "Gaya mana yadda za ka yi amfani da shi.",
    launch: "Yanzu ya iso cikin kundin.",
  },
  ar: {
    sales: "جاهز عندما تكون جاهزًا.",
    awareness: "تعرّف على المنتج الذي يسأل عنه التجار.",
    engage: "أخبرنا كيف ستستخدمه.",
    launch: "وصل للتو إلى الكتالوج.",
  },
  yo: {
    sales: "Ó ṣetán nígbà tí o bá ṣetán.",
    awareness: "Pàdé ọjà tí àwọn ilé-ìtajà ń béèrè.",
    engage: "Sọ bí o ṣe máa lòó.",
    launch: "Ó ṣẹ̀ṣẹ̀ dé nínú àkójọ.",
  },
  ig: {
    sales: "Ọ dị njikere mgbe ị dị njikere.",
    awareness: "Zute ngwaahịa a ndị ahịa na-ajụ.",
    engage: "Gwa anyị ka ị ga-esi jiri ya.",
    launch: "Ọ ka bịarutere n'akwụkwọ ngwaahịa.",
  },
  sw: {
    sales: "Tayari unapokuwa tayari.",
    awareness: "Kutana na bidhaa ambayo maduka huuliza.",
    engage: "Tuambie utaitumiaje.",
    launch: "Imewasili tu kwenye katalogi.",
  },
  ff: {
    sales: "Hewaa so a hewii.",
    awareness: "Ndaar ngalu ngu luumoo naaŋata.",
    engage: "Haalan min no mbaaw-ɗaa huutoraade.",
    launch: "Nawti e deftere ngalu.",
  },
};

const STYLE_TONE: Record<Locale, Record<StudioStyle, string>> = {
  en: {
    modern: "Clean lines. High impact.",
    minimal: "Simple, elegant, and clear.",
    luxury: "Crafted for a premium finish.",
    friendly: "Warm, useful, and easy to love.",
  },
  ha: {
    modern: "Tsafta da ƙarfi.",
    minimal: "Sauƙi, kyau, a bayyane.",
    luxury: "An yi shi da kyau na musamman.",
    friendly: "Dumi, amfani, da so.",
  },
  ar: {
    modern: "خطوط نظيفة وتأثير قوي.",
    minimal: "بسيط وأنيق وواضح.",
    luxury: "بجودة فاخرة.",
    friendly: "دافئ وسهل الإعجاب.",
  },
  yo: {
    modern: "Kíkún, tó lágbára.",
    minimal: "Rọrùn, lẹ́wà, kedere.",
    luxury: "A ṣe é pẹ̀lú ọlá.",
    friendly: "Itunu, wúlò, rọrùn láti fẹ́ràn.",
  },
  ig: {
    modern: "Ọcha na ike.",
    minimal: "Dị mfe, mara mma, doro anya.",
    luxury: "Emere ya n'elu ọkwa.",
    friendly: "Na-ekpo ọkụ, bara uru.",
  },
  sw: {
    modern: "Safifu na yenye nguvu.",
    minimal: "Rahisi, maridadi, wazi.",
    luxury: "Imetengenezwa kwa kiwango cha juu.",
    friendly: "Ya joto, yenye faida, rahisi kupendwa.",
  },
  ff: {
    modern: "Laaɓal e doole.",
    minimal: "Newi, jooɗɗi, laaɓi.",
    luxury: "Waɗaa e teddungal.",
    friendly: "Ngiɗal, nafa, newii yiɗeede.",
  },
};

export const STUDIO_LANGUAGE_NAME: Record<Locale, string> = {
  en: "English",
  ha: "Hausa",
  ar: "Arabic",
  yo: "Yoruba",
  ig: "Igbo",
  sw: "Swahili",
  ff: "Fulfulde",
};

export const STUDIO_PROMPT_PLACEHOLDER: Record<Locale, string> = {
  en: "Pepper sauce on a wooden table in Sabon Gari. Steam rising. Hungry customers. ₦2,500. Weekend promo.",
  ha: "Miya mai barkono a kan teburin itace a Sabon Gari. Tururi yana tashi. ₦2,500. Rangadin karshen mako.",
  ar: "صلصة فلفل على طاولة خشب في السوق. بخار يتصاعد. ₦٢٬٥٠٠. عرض نهاية الأسبوع.",
  yo: "Obe ata lórí tábìlì igi ní ọjà. Èéfín ń jáde. ₦2,500. Ìpolówó òpin ọ̀sẹ̀.",
  ig: "Ofe ose n’elu tebụl osisi n’ahịa. Anwụrụ ọkụ na-ebili. ₦2,500. Mgbasa ozi izu ụka.",
  sw: "Mchuzi wa pilipili kwenye meza ya mbao sokoni. Mvuke unapanda. ₦2,500. Ofa ya wikendi.",
  ff: "Haako boowol e taabal leɗɗe e luumo. Cuurki ummii. ₦2,500. Yeeyirde yontere.",
};

export const STUDIO_EXAMPLE_PROMPTS: Record<Locale, string[]> = {
  en: [
    "Pepper sauce on a wooden table in Sabon Gari, steam rising, hungry customers, ₦2,500, weekend promo.",
    "Fresh bread at dawn, golden crust, market stall light, buy 3 get 1 free.",
    "WhatsApp status for this rice — clean, bright, ₦28,000 per bag, pickup today.",
  ],
  ha: [
    "Miya mai barkono a teburin itace, tururi, ₦2,500, rangadin karshen mako.",
    "Burodi mai dadi da safe, hasken kasuwa, saya 3 ka sami 1 kyauta.",
    "Matsayin WhatsApp na shinkafa — haske, ₦28,000 a jaka, dauka yau.",
  ],
  ar: [
    "صلصة فلفل على طاولة خشب في السوق، بخار، ₦٢٬٥٠٠، عرض نهاية الأسبوع.",
    "خبز طازج عند الفجر، قشرة ذهبية، اشترِ ٣ واحصل على ١ مجانًا.",
    "حالة واتساب لهذا الأرز — واضح، ₦٢٨٬٠٠٠ للكيس، استلام اليوم.",
  ],
  yo: [
    "Obe ata lórí tábìlì igi, èéfín, ₦2,500, ìpolówó òpin ọ̀sẹ̀.",
    "Búrẹ́dì titun ní òwúrọ̀, ra mẹ́ta gba ọ̀kan lọ́fẹ́.",
    "Ìpò WhatsApp fún ìrẹsì yìí — ₦28,000 lẹ́gbẹ́, gbé lónìí.",
  ],
  ig: [
    "Ofe ose n’elu tebụl osisi, anwụrụ ọkụ, ₦2,500, mgbasa ozi izu ụka.",
    "Achịcha ọhụrụ n’ụtụtụ, zụọ 3 nweta 1 n’efu.",
    "Ọnọdụ WhatsApp maka osikapa a — ₦28,000 otu akpa, were taa.",
  ],
  sw: [
    "Mchuzi wa pilipili kwenye meza ya mbao, mvuke, ₦2,500, ofa ya wikendi.",
    "Mkate mpya alfajiri, nunua 3 pata 1 bure.",
    "Hali ya WhatsApp ya mchele — ₦28,000 kwa gunia, chukua leo.",
  ],
  ff: [
    "Haako boowol e taabal leɗɗe, cuurki, ₦2,500, yeeyirde yontere.",
    "Mburu keso subaka, sood 3 heɓ 1 meeree.",
    "Ngonka WhatsApp mbaro — ₦28,000 e booro, ƴett hannde.",
  ],
};

const CTA: Record<Locale, string> = {
  en: "Buy now on TIJAR",
  ha: "Sayi yanzu a TIJAR",
  ar: "اشترِ الآن على TIJAR",
  yo: "Ra nísinsin yìí lórí TIJAR",
  ig: "Zụọ ugbu a na TIJAR",
  sw: "Nunua sasa kwenye TIJAR",
  ff: "Soodu jooni e TIJAR",
};

const SCRIPT_LEAD: Record<Locale, string> = {
  en: "3–10s clip",
  ha: "Shirin daƙiƙa 3–10",
  ar: "مقطع 3–10 ثانية",
  yo: "Fídíò ìṣẹ́jú àáyá 3–10",
  ig: "Vidiyo nkeji 3–10",
  sw: "Klipu ya sekunde 3–10",
  ff: "Widewo 3–10 hojomaaji",
};

export function studioCta(locale: Locale): string {
  return CTA[locale];
}

export function draftStudioContent(input: {
  productName: string;
  businessName: string;
  description?: string | null;
  notes?: string | null;
  salePrice?: number | null;
  unit?: string | null;
  goal: StudioGoal;
  style: StudioStyle;
  locale: Locale;
}): StudioDraft {
  const locale = input.locale;
  const desc = (input.description || input.notes || "").trim().replace(/\s+/g, " ").slice(0, 160);
  const price = input.salePrice != null ? formatNgn(input.salePrice) : null;
  const unit = input.unit?.trim();
  const hook = GOAL_HOOK[locale][input.goal];
  const tone = STYLE_TONE[locale][input.style];
  const cta = CTA[locale];
  const priceBit = price ? (unit ? `${price} / ${unit}` : price) : null;
  const caption = [
    `${input.productName} · ${input.businessName}`,
    hook,
    tone,
    desc || null,
    priceBit,
    cta,
  ]
    .filter(Boolean)
    .join(" ");

  const tags = [
    "tijar",
    input.goal,
    input.style,
    input.productName.split(/\s+/).slice(0, 2).join("").toLowerCase(),
  ].filter(Boolean);

  const script = [
    `${SCRIPT_LEAD[locale]}: ${input.productName}.`,
    hook,
    desc ? desc.slice(0, 90) : tone,
    priceBit ? priceBit : "",
    cta,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    caption,
    hashtags: tags.map((t) => t.replace(/[^\p{L}\p{N}]+/gu, "")).filter(Boolean),
    cta,
    script,
    source: "catalogue",
  };
}
