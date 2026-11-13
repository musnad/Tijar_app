import { NIGERIA_STATES } from "@/lib/nigeria-locations";
import { displayShopName } from "@/lib/shop-names";
import { PRODUCTION_ORIGIN } from "@/lib/site-url";
import { getSupabasePublicServerClient } from "@/lib/supabase/public-server";
import {
  findKeyword,
  haystackMatchesKeyword,
  mergeKeywordLists,
  relatedKeywords,
  type SeoKeyword,
} from "@/lib/seo/keywords";
import {
  formatPlaceHeading,
  locationMatchesArea,
  locationMatchesState,
  placeSlug,
  resolveNigeriaState,
  resolveStateLga,
} from "@/lib/seo/location-taxonomy";
import { isPublicShopIndexable, shopPlaceLine } from "@/lib/seo/eligibility";
import type { PublicBusiness, PublicProduct } from "@/types/database";

const PAGE_SIZE = 24;
const SHOP_CACHE_MS = 10 * 60 * 1000;

const SHOP_SELECT =
  "id, slug, business_name, description, location_text, public_location_label, latitude, longitude, logo_url, cover_image_url, category_name, public_phone, public_whatsapp, is_verified, verification_status";

export type LocationDirectory = {
  stateName: string;
  areaName: string | null;
  keyword: SeoKeyword | null;
  categoryFallback: string | null;
  shops: PublicBusiness[];
  products: PublicProduct[];
  related: Array<{ label: string; href: string }>;
  indexable: boolean;
  page: number;
  pageSize: number;
  totalShops: number;
  placeLabel: string;
};

type ShopCache = { at: number; shops: PublicBusiness[] };
let shopCache: ShopCache | null = null;
let keywordCache: { at: number; rows: SeoKeyword[] } | null = null;

async function extraKeywords(): Promise<SeoKeyword[]> {
  const now = Date.now();
  if (keywordCache && now - keywordCache.at < SHOP_CACHE_MS) return keywordCache.rows;
  const supabase = getSupabasePublicServerClient();
  if (!supabase) return keywordCache?.rows ?? [];
  const { data, error } = await supabase
    .from("seo_keyword_aliases")
    .select("keyword, language, category_slug, english_label, hausa_label, active")
    .eq("active", true)
    .limit(500);
  if (error || !data) {
    keywordCache = { at: now, rows: [] };
    return [];
  }
  const rows: SeoKeyword[] = data.map((row) => {
    const slug = placeSlug(String(row.keyword ?? ""));
    const englishLabel = String(row.english_label ?? slug);
    const hausaLabel = String(row.hausa_label ?? row.keyword ?? slug);
    return {
      slug,
      language: row.language === "en" ? "en" : "ha",
      phrases: [String(row.keyword ?? ""), englishLabel, hausaLabel],
      englishLabel,
      hausaLabel,
      categorySlug: String(row.category_slug ?? ""),
      categoryName: String(row.category_slug ?? ""),
      heading: englishLabel,
      description: `${englishLabel} on Tijar.`,
    };
  });
  keywordCache = { at: now, rows };
  return rows;
}

function asShop(row: Record<string, unknown>): PublicBusiness | null {
  const slug = String(row.slug ?? row.public_slug ?? "").trim();
  const business_name = displayShopName((row.business_name as string | null) ?? null);
  if (!slug || !business_name) return null;
  return {
    id: String(row.id ?? ""),
    slug,
    business_name,
    description: (row.description as string | null) ?? null,
    location_text: (row.location_text as string | null) ?? null,
    public_location_label: (row.public_location_label as string | null) ?? null,
    latitude: (row.latitude as number | null) ?? null,
    longitude: (row.longitude as number | null) ?? null,
    logo_url: (row.logo_url as string | null) ?? null,
    cover_image_url: (row.cover_image_url as string | null) ?? null,
    category_id: (row.category_id as string | null) ?? null,
    category_name: (row.category_name as string | null) ?? null,
    public_phone: (row.public_phone as string | null) ?? null,
    public_whatsapp: (row.public_whatsapp as string | null) ?? null,
    opening_hours: {},
    is_verified: Boolean(row.is_verified),
    verification_status: (row.verification_status as string) ?? "unverified",
  };
}

export async function listDirectoryShops(force = false): Promise<PublicBusiness[]> {
  const now = Date.now();
  if (!force && shopCache && now - shopCache.at < SHOP_CACHE_MS) return shopCache.shops;
  const supabase = getSupabasePublicServerClient();
  if (!supabase) return shopCache?.shops ?? [];
  const { data } = await supabase.from("public_marketplace_businesses").select(SHOP_SELECT).not("slug", "is", null).limit(4000);
  const shops = (data ?? []).map((row) => asShop(row as Record<string, unknown>)).filter((row): row is PublicBusiness => Boolean(row));
  shopCache = { at: now, shops };
  return shops;
}

function shopHaystack(shop: PublicBusiness): string {
  return [shop.business_name, shop.description, shop.category_name, shop.custom_category, ...(shop.product_names ?? [])]
    .filter(Boolean)
    .join(" ");
}

function shopInPlace(shop: PublicBusiness, stateName: string, areaName: string | null): boolean {
  const loc = shopPlaceLine(shop);
  if (!locationMatchesState(loc, stateName)) return false;
  if (areaName && !locationMatchesArea(loc, areaName)) return false;
  return true;
}

function shopMatchesTopic(shop: PublicBusiness, keyword: SeoKeyword | null, categoryFallback: string | null): boolean {
  const hay = shopHaystack(shop);
  if (keyword) return haystackMatchesKeyword(hay, keyword);
  if (categoryFallback) {
    const cat = (shop.category_name ?? "").toLowerCase();
    return cat === categoryFallback.toLowerCase() || placeSlug(shop.category_name ?? "") === placeSlug(categoryFallback);
  }
  return true;
}

export function nigeriaPath(stateSlug: string, categorySlug: string, areaSlug?: string | null): string {
  if (areaSlug) return `/nigeria/${encodeURIComponent(stateSlug)}/${encodeURIComponent(areaSlug)}/${encodeURIComponent(categorySlug)}`;
  return `/nigeria/${encodeURIComponent(stateSlug)}/${encodeURIComponent(categorySlug)}`;
}

export function nigeriaPageUrl(stateSlug: string, categorySlug: string, areaSlug?: string | null): string {
  return `${PRODUCTION_ORIGIN}${nigeriaPath(stateSlug, categorySlug, areaSlug)}`;
}

export async function fetchLocationDirectory(input: {
  stateSlug: string;
  categorySlug: string;
  areaSlug?: string | null;
  page?: number;
}): Promise<LocationDirectory | null> {
  const state = resolveNigeriaState(input.stateSlug);
  if (!state) return null;
  const areaName = input.areaSlug ? resolveStateLga(state, input.areaSlug) || decodeURIComponent(input.areaSlug).replace(/-/g, " ") : null;
  const extras = await extraKeywords();
  const keyword = findKeyword(input.categorySlug, extras);
  const categoryFallback = keyword ? null : decodeURIComponent(input.categorySlug).replace(/-/g, " ");
  const page = Math.max(1, input.page ?? 1);
  const shops = (await listDirectoryShops()).filter(
    (shop) => isPublicShopIndexable(shop) && shopInPlace(shop, state.name, areaName) && shopMatchesTopic(shop, keyword, categoryFallback),
  );
  const start = (page - 1) * PAGE_SIZE;
  const slice = shops.slice(start, start + PAGE_SIZE);
  const placeLabel = formatPlaceHeading(state.name, areaName);
  const related = keyword
    ? relatedKeywords(keyword, extras).map((row) => ({
        label: row.heading,
        href: nigeriaPath(placeSlug(state.name), row.slug, input.areaSlug ? placeSlug(areaName || "") : null),
      }))
    : [];
  const products = await productsForShops(slice.map((shop) => shop.id));
  return {
    stateName: state.name,
    areaName,
    keyword,
    categoryFallback,
    shops: slice,
    products,
    related,
    indexable: shops.length > 0,
    page,
    pageSize: PAGE_SIZE,
    totalShops: shops.length,
    placeLabel,
  };
}

async function productsForShops(ids: string[]): Promise<PublicProduct[]> {
  if (ids.length === 0) return [];
  const supabase = getSupabasePublicServerClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("public_business_products")
    .select(
      "id, business_id, name, kind, description, sale_price, unit, image_url, is_available, business_name, business_slug, category_name",
    )
    .in("business_id", ids)
    .limit(48);
  return (data ?? []) as PublicProduct[];
}

export async function fetchNigeriaHub(): Promise<Array<{ state: string; slug: string; count: number }>> {
  const shops = (await listDirectoryShops()).filter((shop) => isPublicShopIndexable(shop));
  const counts = new Map<string, number>();
  for (const shop of shops) {
    const loc = shopPlaceLine(shop);
    for (const known of NIGERIA_STATES) {
      if (locationMatchesState(loc, known.name)) {
        counts.set(known.name, (counts.get(known.name) ?? 0) + 1);
        break;
      }
    }
  }
  return [...counts.entries()]
    .map(([state, count]) => ({ state, slug: placeSlug(state), count }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.state.localeCompare(b.state));
}

export async function fetchStateDirectory(stateSlug: string): Promise<{
  stateName: string;
  topics: Array<{ label: string; href: string; count: number }>;
  shops: PublicBusiness[];
  indexable: boolean;
} | null> {
  const state = resolveNigeriaState(stateSlug);
  if (!state) return null;
  const inState = (await listDirectoryShops()).filter((shop) => isPublicShopIndexable(shop) && shopInPlace(shop, state.name, null));
  const keywords = mergeKeywordLists(await extraKeywords());
  const topics: Array<{ label: string; href: string; count: number }> = [];
  for (const keyword of keywords) {
    const count = inState.filter((shop) => shopMatchesTopic(shop, keyword, null)).length;
    if (count < 1) continue;
    topics.push({
      label: keyword.heading,
      href: nigeriaPath(placeSlug(state.name), keyword.slug),
      count,
    });
  }
  return {
    stateName: state.name,
    topics,
    shops: inState.slice(0, 24),
    indexable: inState.length > 0,
  };
}

export async function collectLocationSitemapPaths(): Promise<string[]> {
  const shops = (await listDirectoryShops()).filter((shop) => isPublicShopIndexable(shop));
  const paths = new Set<string>(["/nigeria"]);
  const keywords = mergeKeywordLists(await extraKeywords());
  for (const state of NIGERIA_STATES) {
    const inState = shops.filter((shop) => shopInPlace(shop, state.name, null));
    if (inState.length === 0) continue;
    paths.add(`/nigeria/${placeSlug(state.name)}`);
    for (const keyword of keywords) {
      const matched = inState.filter((shop) => shopMatchesTopic(shop, keyword, null));
      if (matched.length === 0) continue;
      paths.add(nigeriaPath(placeSlug(state.name), keyword.slug));
      const areas = new Set<string>();
      for (const shop of matched) {
        const loc = shopPlaceLine(shop);
        for (const lga of state.lgas) {
          if (locationMatchesArea(loc, lga)) areas.add(lga);
        }
      }
      for (const area of areas) {
        const areaShops = matched.filter((shop) => locationMatchesArea(shopPlaceLine(shop), area));
        if (areaShops.length === 0) continue;
        paths.add(nigeriaPath(placeSlug(state.name), keyword.slug, placeSlug(area)));
      }
    }
  }
  return [...paths];
}
