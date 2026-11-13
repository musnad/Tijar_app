import { displayShopName } from "@/lib/shop-names";
import { PRODUCTION_ORIGIN } from "@/lib/site-url";
import { getSupabasePublicServerClient } from "@/lib/supabase/public-server";
import type { PublicBusiness, PublicProduct } from "@/types/database";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SHOP_COLUMNS =
  "id, slug, business_name, description, location_text, public_location_label, latitude, longitude, logo_url, cover_image_url, category_id, category_name, public_phone, public_whatsapp, opening_hours, is_verified, verification_status";

export type PublicShopPage = {
  business: PublicBusiness | null;
  products: PublicProduct[];
  videos: [];
  error: string | null;
};

export function shopPageUrl(slug: string): string {
  return `${PRODUCTION_ORIGIN}/b/${encodeURIComponent(slug)}`;
}

export function productPageUrl(productId: string): string {
  return `${PRODUCTION_ORIGIN}/shop/p/${encodeURIComponent(productId)}`;
}

export function absoluteSeoImage(url: string | null | undefined): string {
  const fallback = `${PRODUCTION_ORIGIN}/tijar-logo.png`;
  if (!url?.trim()) return fallback;
  if (/^https?:\/\//i.test(url)) return url;
  return `${PRODUCTION_ORIGIN}${url.startsWith("/") ? url : `/${url}`}`;
}

function asShop(row: Record<string, unknown>, fallbackSlug: string): PublicBusiness {
  return {
    id: String(row.id ?? ""),
    slug: String((row.slug as string | null) || (row.public_slug as string | null) || fallbackSlug).trim(),
    business_name: displayShopName((row.business_name as string | null) ?? null),
    description: (row.description as string | null) ?? null,
    location_text: ((row.location_text as string | null) ?? (row.location as string | null)) ?? null,
    public_location_label: (row.public_location_label as string | null) ?? null,
    latitude: (row.latitude as number | null) ?? null,
    longitude: (row.longitude as number | null) ?? null,
    logo_url: (row.logo_url as string | null) ?? null,
    cover_image_url: (row.cover_image_url as string | null) ?? null,
    category_id: (row.category_id as string | null) ?? null,
    category_name: (row.category_name as string | null) ?? null,
    public_phone: (row.public_phone as string | null) ?? null,
    public_whatsapp: (row.public_whatsapp as string | null) ?? null,
    opening_hours: ((row.opening_hours as Record<string, string> | null) ?? {}) as Record<string, string>,
    is_verified: Boolean(row.is_verified),
    verification_status: (row.verification_status as string) ?? "unverified",
    is_informal: (row.is_informal as boolean | undefined) ?? true,
  };
}

function placeLine(shop: Pick<PublicBusiness, "public_location_label" | "location_text">): string {
  return (shop.public_location_label || shop.location_text || "").trim();
}

export function shopSeoTitle(shop: PublicBusiness): string {
  const place = placeLine(shop);
  const category = shop.category_name?.trim();
  const bits = [shop.business_name, category, place].filter(Boolean);
  return `${bits.join(" — ")} | TIJAR`;
}

export function shopSeoDescription(shop: PublicBusiness, products: PublicProduct[]): string {
  const fromShop = shop.description?.replace(/\s+/g, " ").trim();
  if (fromShop) return fromShop.slice(0, 300);
  const place = placeLine(shop);
  const names = products
    .map((p) => p.name)
    .filter(Boolean)
    .slice(0, 6)
    .join(", ");
  const where = place ? ` in ${place}` : " in Nigeria";
  const catalog = names ? ` Selling ${names}.` : "";
  return `${shop.business_name} on TIJAR${where}.${catalog} Watch, follow, and order on tijar.ng.`.slice(0, 300);
}

export function shopJsonLd(shop: PublicBusiness, products: PublicProduct[]): Record<string, unknown> {
  const url = shopPageUrl(shop.slug);
  const place = placeLine(shop);
  const offers = products.slice(0, 24).map((p) => ({
    "@type": "Offer",
    url: productPageUrl(p.id),
    name: p.name,
    price: p.sale_price != null ? String(p.sale_price) : undefined,
    priceCurrency: "NGN",
    availability: p.is_available === false ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
    image: p.image_url ? absoluteSeoImage(p.image_url) : undefined,
  }));
  return {
    "@context": "https://schema.org",
    "@type": "Store",
    name: shop.business_name,
    url,
    image: absoluteSeoImage(shop.cover_image_url || shop.logo_url),
    logo: absoluteSeoImage(shop.logo_url),
    description: shopSeoDescription(shop, products),
    telephone: shop.public_phone || shop.public_whatsapp || undefined,
    address: place
      ? {
          "@type": "PostalAddress",
          addressLocality: place,
          addressCountry: "NG",
        }
      : { "@type": "PostalAddress", addressCountry: "NG" },
    geo:
      shop.latitude != null && shop.longitude != null
        ? { "@type": "GeoCoordinates", latitude: shop.latitude, longitude: shop.longitude }
        : undefined,
    brand: { "@type": "Brand", name: "TIJAR", url: PRODUCTION_ORIGIN },
    hasOfferCatalog:
      offers.length > 0
        ? {
            "@type": "OfferCatalog",
            name: `${shop.business_name} on TIJAR`,
            itemListElement: offers,
          }
        : undefined,
  };
}

export function productPlace(product: PublicProduct): string {
  return (product.business_public_location_label || product.business_location_text || "").trim();
}

export function productSeoTitle(product: PublicProduct): string {
  const shop = displayShopName(product.business_name);
  const place = productPlace(product);
  if (place) return `${product.name} in ${place} | Buy on TIJAR`;
  return `${product.name} from ${shop} | Buy on TIJAR`;
}

export function productSeoDescription(product: PublicProduct): string {
  const shop = displayShopName(product.business_name);
  const place = productPlace(product);
  const fromBody = product.description?.replace(/\s+/g, " ").trim();
  if (fromBody) return fromBody.slice(0, 300);
  const price = product.sale_price != null ? ` ₦${Number(product.sale_price).toLocaleString("en-NG")}.` : "";
  const where = place ? ` in ${place}` : " in Nigeria";
  return `Buy ${product.name}${where} from ${shop} on TIJAR.${price} Order online at tijar.ng.`.slice(0, 300);
}

export function productSeoKeywords(product: PublicProduct): string {
  const shop = displayShopName(product.business_name);
  const place = productPlace(product);
  return [
    product.name,
    `buy ${product.name}`,
    `${product.name} Nigeria`,
    `${product.name} price`,
    shop,
    place,
    product.category_name,
    "TIJAR",
    "tijar.ng",
  ]
    .filter(Boolean)
    .join(", ");
}

export function productJsonLd(product: PublicProduct): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: productSeoDescription(product),
    image: absoluteSeoImage(product.image_url),
    url: productPageUrl(product.id),
    brand: { "@type": "Brand", name: "TIJAR" },
    offers: {
      "@type": "Offer",
      url: productPageUrl(product.id),
      priceCurrency: "NGN",
      price: product.sale_price != null ? String(product.sale_price) : undefined,
      availability: product.is_available === false ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      seller: {
        "@type": "Organization",
        name: displayShopName(product.business_name),
        url: product.business_slug ? shopPageUrl(product.business_slug) : PRODUCTION_ORIGIN,
      },
    },
  };
}

export function seoHead(input: {
  title: string;
  description: string;
  url: string;
  image: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  keywords?: string;
  noIndex?: boolean;
}) {
  const graphs = input.jsonLd ? (Array.isArray(input.jsonLd) ? input.jsonLd : [input.jsonLd]) : [];
  return {
    meta: [
      { title: input.title },
      { name: "description", content: input.description },
      ...(input.keywords ? [{ name: "keywords", content: input.keywords }] : []),
      { name: "robots", content: input.noIndex ? "noindex, nofollow" : "index, follow, max-image-preview:large" },
      { name: "googlebot", content: input.noIndex ? "noindex, nofollow" : "index, follow, max-image-preview:large" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "TIJAR" },
      { property: "og:title", content: input.title },
      { property: "og:description", content: input.description },
      { property: "og:url", content: input.url },
      { property: "og:image", content: input.image },
      { property: "og:locale", content: "en_NG" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: input.title },
      { name: "twitter:description", content: input.description },
      { name: "twitter:image", content: input.image },
    ],
    links: [{ rel: "canonical", href: input.url }],
    scripts: graphs.map((graph) => ({ type: "application/ld+json", children: JSON.stringify(graph) })),
  };
}

async function lookupShop(slug: string): Promise<PublicBusiness | null> {
  const supabase = getSupabasePublicServerClient();
  if (!supabase) return null;
  const clean = slug.trim();
  if (!clean) return null;

  const fromListings = await supabase.from("public_business_listings").select(SHOP_COLUMNS).eq("slug", clean).maybeSingle();
  if (fromListings.data) return asShop(fromListings.data as Record<string, unknown>, clean);

  const fromMarket = await supabase.from("public_marketplace_businesses").select(SHOP_COLUMNS).eq("slug", clean).maybeSingle();
  if (fromMarket.data) return asShop(fromMarket.data as Record<string, unknown>, clean);

  const fromOwned = await supabase
    .from("businesses")
    .select(
      "id, public_slug, business_name, description, location, logo_url, cover_image_url, category_id, public_phone, public_whatsapp, opening_hours, latitude, longitude, public_location_label, verification_status, is_informal",
    )
    .eq("public_slug", clean)
    .maybeSingle();
  if (fromOwned.data) return asShop(fromOwned.data as Record<string, unknown>, clean);

  if (UUID_RE.test(clean)) {
    const byId = await supabase.from("public_marketplace_businesses").select(SHOP_COLUMNS).eq("id", clean).maybeSingle();
    if (byId.data) return asShop(byId.data as Record<string, unknown>, clean);
    const listingId = await supabase.from("public_business_listings").select(SHOP_COLUMNS).eq("id", clean).maybeSingle();
    if (listingId.data) return asShop(listingId.data as Record<string, unknown>, clean);
  }
  return null;
}

export async function fetchPublicShopPage(slug: string): Promise<PublicShopPage> {
  try {
    const business = await lookupShop(slug);
    if (!business) return { business: null, products: [], videos: [], error: null };
    const supabase = getSupabasePublicServerClient();
    if (!supabase) return { business, products: [], videos: [], error: null };
    let productsRes = await supabase
      .from("public_business_products")
      .select(
        "id, business_id, name, kind, description, sale_price, unit, image_url, extra_image_urls, is_available, business_name, business_slug, business_logo_url, category_name",
      )
      .eq("business_id", business.id)
      .order("name")
      .limit(80);
    if (productsRes.error) {
      productsRes = await supabase
        .from("public_business_products")
        .select("id, business_id, name, kind, description, sale_price, unit, image_url, is_available")
        .eq("business_id", business.id)
        .order("name")
        .limit(80);
    }
    return {
      business,
      products: (productsRes.data ?? []) as PublicProduct[],
      videos: [],
      error: productsRes.error?.message ?? null,
    };
  } catch (err) {
    return { business: null, products: [], videos: [], error: err instanceof Error ? err.message : "Could not load this shop." };
  }
}

export async function fetchPublicProduct(productId: string): Promise<PublicProduct | null> {
  const supabase = getSupabasePublicServerClient();
  if (!supabase || !productId.trim()) return null;
  let { data, error } = await supabase
    .from("public_business_products")
    .select(
      "id, business_id, name, kind, description, sale_price, unit, image_url, extra_image_urls, is_available, business_name, business_slug, business_logo_url, category_name, business_location_text, business_public_location_label",
    )
    .eq("id", productId)
    .maybeSingle();
  if (error) {
    const legacy = await supabase
      .from("public_business_products")
      .select("id, business_id, name, kind, description, sale_price, unit, image_url, is_available")
      .eq("id", productId)
      .maybeSingle();
    data = legacy.data;
  }
  if (!data) return null;
  const product = data as PublicProduct;
  if (!product.business_name || !product.business_slug) {
    const shop = await supabase
      .from("public_marketplace_businesses")
      .select("slug, business_name, logo_url")
      .eq("id", product.business_id)
      .maybeSingle();
    if (shop.data) {
      return {
        ...product,
        business_name: displayShopName(shop.data.business_name as string | null, product.business_name),
        business_slug: (shop.data.slug as string | null) ?? product.business_slug,
        business_logo_url: (shop.data.logo_url as string | null) ?? product.business_logo_url,
      };
    }
  }
  return product;
}

export async function listPublicShopSlugs(limit = 5000): Promise<string[]> {
  const supabase = getSupabasePublicServerClient();
  if (!supabase) return [];
  const market = await supabase.from("public_marketplace_businesses").select("slug").not("slug", "is", null).limit(limit);
  const slugs = (market.data ?? []).map((row) => String(row.slug ?? "").trim()).filter(Boolean);
  if (slugs.length > 0) return [...new Set(slugs)];
  const listings = await supabase.from("public_business_listings").select("slug").not("slug", "is", null).limit(limit);
  return [...new Set((listings.data ?? []).map((row) => String(row.slug ?? "").trim()).filter(Boolean))];
}

export async function listPublicProductIds(limit = 5000): Promise<string[]> {
  const supabase = getSupabasePublicServerClient();
  if (!supabase) return [];
  const { data } = await supabase.from("public_business_products").select("id").limit(limit);
  return (data ?? []).map((row) => String(row.id ?? "")).filter(Boolean);
}

export function buildSitemapXml(paths: string[]): string {
  const urls = paths
    .map((path) => {
      const loc = path.startsWith("http") ? path : `${PRODUCTION_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
      return `  <url><loc>${escapeXml(loc)}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
