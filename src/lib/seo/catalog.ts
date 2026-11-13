import { displayShopName } from "@/lib/shop-names";
import {
  absoluteSeoImage,
  listPublicProductIds,
  listPublicShopSlugs,
  productPageUrl,
  seoHead,
  shopPageUrl,
} from "@/lib/seo/public-shop";
import { PRODUCTION_ORIGIN } from "@/lib/site-url";
import { getSupabasePublicServerClient } from "@/lib/supabase/public-server";
import { slugifyBusinessName } from "@/utils/discover";
import type { PublicBusiness, PublicProduct } from "@/types/database";

export type SeoListing = {
  id: string;
  title: string;
  details: string | null;
  price: number;
  image_urls: string[];
  shop_name: string;
  shop_slug: string;
  location_label: string | null;
  category: string | null;
  is_open: boolean;
};

export type PublicCatalog = {
  products: PublicProduct[];
  shops: PublicBusiness[];
  categories: string[];
};

const PRODUCT_SELECT =
  "id, business_id, name, kind, description, sale_price, unit, image_url, extra_image_urls, is_available, business_name, business_slug, business_logo_url, category_name, business_location_text, business_public_location_label";

export const SEO_STATIC_PATHS = [
  "/",
  "/discover",
  "/about",
  "/how-it-works",
  "/learn",
  "/contact",
  "/business-visibility",
  "/shop",
  "/shop/discover",
  "/shop/browse",
  "/shop/nearby",
  "/shop/services",
  "/shop/order-now",
];

export const SEO_SEARCH_SEEDS = [
  "rice",
  "tomatoes",
  "beans",
  "garri",
  "palm oil",
  "phone",
  "iphone",
  "laptop",
  "tv",
  "generator",
  "gas cooker",
  "shoes",
  "sneakers",
  "clothes",
  "ankara",
  "wig",
  "perfume",
  "bag",
  "furniture",
  "cement",
  "jollof",
  "suya",
];

export function categorySlug(name: string): string {
  return slugifyBusinessName(name) || "shop";
}

export function categoryPageUrl(name: string): string {
  return `${PRODUCTION_ORIGIN}/shop/c/${encodeURIComponent(categorySlug(name))}`;
}

export function searchPageUrl(query: string): string {
  return `${PRODUCTION_ORIGIN}/shop/search/${encodeURIComponent(query.trim().slice(0, 60))}`;
}

export function listingPageUrl(id: string): string {
  return `${PRODUCTION_ORIGIN}/shop/order-now/${encodeURIComponent(id)}`;
}

export function organizationJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "TIJAR",
    legalName: "TIJAR Limited",
    url: PRODUCTION_ORIGIN,
    logo: absoluteSeoImage("/tijar-logo.png"),
    description: "TIJAR is the social marketplace for Nigerian shops — watch, follow, and buy now.",
    areaServed: { "@type": "Country", name: "Nigeria" },
    sameAs: [PRODUCTION_ORIGIN],
  };
}

export function websiteJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "TIJAR",
    url: PRODUCTION_ORIGIN,
    description: "Buy from local Nigerian shops on TIJAR. Search products, compare prices, and order on tijar.ng.",
    publisher: { "@type": "Organization", name: "TIJAR", url: PRODUCTION_ORIGIN },
    potentialAction: {
      "@type": "SearchAction",
      target: `${PRODUCTION_ORIGIN}/shop/search/{search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function itemListJsonLd(name: string, url: string, items: Array<{ name: string; url: string }>): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    url,
    numberOfItems: items.length,
    itemListElement: items.slice(0, 50).map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      url: item.url,
    })),
  };
}

export function categorySeoTitle(category: string): string {
  return `Buy ${category} in Nigeria | TIJAR marketplace`;
}

export function categorySeoDescription(category: string, count: number): string {
  return `Shop ${category.toLowerCase()} from local Nigerian businesses on TIJAR. ${count > 0 ? `${count} listings.` : ""} Compare prices and order on tijar.ng.`.replace(/\s+/g, " ").trim();
}

export function searchSeoTitle(query: string): string {
  return `${query} for sale in Nigeria | Buy on TIJAR`;
}

export function searchSeoDescription(query: string, count: number): string {
  return `Find ${query} from shops across Nigeria on TIJAR. ${count > 0 ? `${count} results.` : "Order from local sellers."} Buy now on tijar.ng.`;
}

export function listingSeoTitle(listing: SeoListing): string {
  const place = listing.location_label?.trim();
  return place ? `${listing.title} in ${place} | Order on TIJAR` : `${listing.title} | Order on TIJAR`;
}

export function listingSeoDescription(listing: SeoListing): string {
  const details = listing.details?.replace(/\s+/g, " ").trim();
  if (details) return details.slice(0, 300);
  const price = ` ₦${Number(listing.price).toLocaleString("en-NG")}`;
  const place = listing.location_label ? ` in ${listing.location_label}` : "";
  return `Place your order for ${listing.title}${place} from ${listing.shop_name} on TIJAR.${price}. tijar.ng`.slice(0, 300);
}

function asShopRow(row: Record<string, unknown>): PublicBusiness {
  return {
    id: String(row.id ?? ""),
    slug: String(row.slug ?? row.public_slug ?? "").trim(),
    business_name: displayShopName((row.business_name as string | null) ?? null),
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

export async function listPublicCategories(): Promise<string[]> {
  const supabase = getSupabasePublicServerClient();
  if (!supabase) return [];
  const names = new Set<string>();
  const cats = await supabase.from("business_categories").select("name").limit(200);
  for (const row of cats.data ?? []) {
    const name = String(row.name ?? "").trim();
    if (name) names.add(name);
  }
  const products = await supabase.from("public_business_products").select("category_name").not("category_name", "is", null).limit(2000);
  for (const row of products.data ?? []) {
    const name = String(row.category_name ?? "").trim();
    if (name) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export async function resolveCategoryName(slug: string): Promise<string | null> {
  const want = slugifyBusinessName(decodeURIComponent(slug));
  if (!want) return null;
  const names = await listPublicCategories();
  return names.find((name) => categorySlug(name) === want) ?? names.find((name) => slugifyBusinessName(name) === want) ?? null;
}

export async function fetchPublicCatalog(input?: { query?: string; category?: string; limit?: number }): Promise<PublicCatalog> {
  const supabase = getSupabasePublicServerClient();
  if (!supabase) return { products: [], shops: [], categories: [] };
  const limit = input?.limit ?? 48;
  const query = input?.query?.trim().slice(0, 80) ?? "";
  const category = input?.category?.trim() ?? "";

  let productQuery = supabase.from("public_business_products").select(PRODUCT_SELECT).limit(limit);
  if (query) {
    const needle = `%${query.replace(/[%*,]/g, "")}%`;
    productQuery = productQuery.or(`name.ilike.${needle},description.ilike.${needle},business_name.ilike.${needle},category_name.ilike.${needle}`);
  } else if (category) {
    productQuery = productQuery.ilike("category_name", category);
  } else {
    productQuery = productQuery.order("created_at", { ascending: false });
  }
  const productsRes = await productQuery;
  const products = (productsRes.data ?? []) as PublicProduct[];

  let shops: PublicBusiness[] = [];
  const shopSelect = "id, slug, business_name, description, location_text, public_location_label, latitude, longitude, logo_url, category_name, is_verified, verification_status";
  if (query) {
    const needle = `%${query.replace(/[%*,]/g, "")}%`;
    const shopsRes = await supabase
      .from("public_marketplace_businesses")
      .select(shopSelect)
      .or(`business_name.ilike.${needle},description.ilike.${needle},category_name.ilike.${needle}`)
      .limit(24);
    shops = (shopsRes.data ?? []).map((row) => asShopRow(row as Record<string, unknown>)).filter((s) => s.slug);
  } else if (category) {
    const shopsRes = await supabase.from("public_marketplace_businesses").select(shopSelect).ilike("category_name", category).limit(24);
    shops = (shopsRes.data ?? []).map((row) => asShopRow(row as Record<string, unknown>)).filter((s) => s.slug);
  } else {
    const shopsRes = await supabase.from("public_marketplace_businesses").select(shopSelect).limit(24);
    shops = (shopsRes.data ?? []).map((row) => asShopRow(row as Record<string, unknown>)).filter((s) => s.slug);
  }

  return { products, shops, categories: await listPublicCategories() };
}

export async function fetchPublicListing(id: string): Promise<SeoListing | null> {
  const supabase = getSupabasePublicServerClient();
  if (!supabase || !id.trim()) return null;
  const { data } = await supabase
    .from("place_order_listings")
    .select("id, title, details, price, image_urls, business_id, location_label, category, is_open")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  let shopName = "Shop";
  let shopSlug = "";
  if (data.business_id) {
    const shop = await supabase
      .from("public_marketplace_businesses")
      .select("slug, business_name")
      .eq("id", data.business_id as string)
      .maybeSingle();
    shopName = displayShopName((shop.data?.business_name as string | null) ?? null);
    shopSlug = String(shop.data?.slug ?? "");
  }
  return {
    id: String(data.id),
    title: String(data.title ?? "Place your order"),
    details: (data.details as string | null) ?? null,
    price: Number(data.price ?? 0),
    image_urls: Array.isArray(data.image_urls) ? (data.image_urls as string[]) : [],
    shop_name: shopName,
    shop_slug: shopSlug,
    location_label: (data.location_label as string | null) ?? null,
    category: (data.category as string | null) ?? null,
    is_open: data.is_open !== false,
  };
}

export async function listPublicListingIds(limit = 2000): Promise<string[]> {
  const supabase = getSupabasePublicServerClient();
  if (!supabase) return [];
  const { data } = await supabase.from("place_order_listings").select("id").eq("is_open", true).limit(limit);
  return (data ?? []).map((row) => String(row.id ?? "")).filter(Boolean);
}

export async function collectSitemapPaths(): Promise<string[]> {
  const [slugs, productIds, categories, listingIds] = await Promise.all([
    listPublicShopSlugs(),
    listPublicProductIds(),
    listPublicCategories(),
    listPublicListingIds(),
  ]);
  return [
    ...SEO_STATIC_PATHS,
    ...SEO_SEARCH_SEEDS.map((term) => `/shop/search/${encodeURIComponent(term)}`),
    ...slugs.map((slug) => `/b/${encodeURIComponent(slug)}`),
    ...productIds.map((id) => `/shop/p/${encodeURIComponent(id)}`),
    ...categories.map((name) => `/shop/c/${encodeURIComponent(categorySlug(name))}`),
    ...listingIds.map((id) => `/shop/order-now/${encodeURIComponent(id)}`),
  ];
}

export function marketingSeo(title: string, description: string, path: string, keywords?: string) {
  return seoHead({
    title,
    description,
    url: path.startsWith("http") ? path : `${PRODUCTION_ORIGIN}${path}`,
    image: absoluteSeoImage("/tijar-logo.png"),
    keywords,
    jsonLd: [organizationJsonLd(), websiteJsonLd()],
  });
}
