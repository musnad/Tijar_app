import { isMockFeedId } from "@/features/marketplace/feed-mock";
import {
  addLocalCartItem,
  isLocalCartId,
  listLocalCart,
  removeLocalCartItem,
  updateLocalCartQuantity,
} from "@/lib/local-cart";
import {
  ensureSavedProduct,
  getLocalOrder,
  listFollowedShopsAsBusinesses,
  listLocalOrders,
  listSavedProducts,
  listShopFollowers,
} from "@/lib/shop-social";
import { displayShopName, lookupShopProfiles } from "@/lib/shop-names";
import { locationMatchesArea } from "@/lib/nigeria-locations";
import { prepareImageForUpload } from "@/lib/media/compress-upload";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { ensureOwnerMembership } from "@/services/business-service";
import type { CheckoutQuote } from "@/lib/checkout/quote";
import { isLivePaymentConfigured } from "@/lib/payments/adapter";
import type {
  CartItem,
  CustomerAddress,
  MarketplaceOrder,
  MarketplaceOrderItem,
  NotificationPreferences,
  PublicBusiness,
  PublicProduct,
} from "@/types/database";
import { resolveShopMapCoords } from "@/lib/maps/shop-coords";
import { haversineKm } from "@/utils/discover";
import { expandSearchTerms } from "@/utils/discover-catalog";

export type NearbyMarketplaceShop = PublicBusiness & {
  distance_km: number;
  products: PublicProduct[];
  map_lat: number;
  map_lng: number;
  location_estimated: boolean;
};

export type MarketplaceShop = PublicBusiness & {
  product_count: number;
  product_names: string[];
};

const MARKETPLACE_SHOP_SELECT =
  "id, slug, business_name, description, location_text, public_location_label, latitude, longitude, logo_url, cover_image_url, category_id, category_name, public_phone, public_whatsapp, opening_hours, is_verified, verification_status, is_informal";

const MARKETPLACE_SHOP_SELECT_CORE =
  "id, slug, business_name, description, location_text, public_location_label, latitude, longitude, logo_url, category_id, category_name, public_phone, public_whatsapp, opening_hours, is_verified, verification_status";

const MARKETPLACE_PRODUCT_SELECT =
  "id, business_id, name, kind, description, sale_price, unit, image_url, extra_image_urls, video_url, attributes, variants, currency, is_available, created_at, updated_at, is_informal, business_name, business_slug, business_logo_url, category_name, service_type, starts_on, ends_on";

const MARKETPLACE_PRODUCT_SELECT_LEGACY =
  "id, business_id, name, kind, description, sale_price, unit, image_url, is_available";

export async function fetchMarketplaceProducts(limit = 48, before?: string | null, offset = 0): Promise<{
  data: PublicProduct[];
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  let query = supabase
    .from("public_business_products")
    .select(MARKETPLACE_PRODUCT_SELECT)
    .order("created_at", { ascending: false });
  if (before) query = query.lt("created_at", before).limit(limit);
  else if (offset > 0) query = query.range(offset, offset + limit - 1);
  else query = query.limit(limit);
  let { data, error } = await query;
  if (error && /created_at/i.test(error.message)) {
    const retry = await supabase
      .from("public_business_products")
      .select(MARKETPLACE_PRODUCT_SELECT)
      .order("name")
      .limit(limit);
    data = retry.data;
    error = retry.error;
  }

  // Fallback before informal marketplace migration is applied.
  if (error) {
    const legacy = await supabase
      .from("public_business_products")
      .select(MARKETPLACE_PRODUCT_SELECT_LEGACY)
      .order("name")
      .limit(limit);
    if (legacy.error) return { data: [], error: legacy.error.message };
    data = legacy.data;
    error = null;

    const { data: listings } = await supabase
      .from("public_business_listings")
      .select("id, slug, business_name, is_informal")
      .limit(400);
    const byId = new Map((listings ?? []).map((b) => [b.id as string, b]));
    return {
      data: await attachProductShopNames(
        (data ?? []).map((p) => {
          const b = byId.get(p.business_id as string);
          return {
            ...(p as PublicProduct),
            business_name: (b?.business_name as string) ?? undefined,
            business_slug: (b?.slug as string) ?? undefined,
            is_informal: (b?.is_informal as boolean | undefined) ?? true,
          };
        }),
      ),
      error: null,
    };
  }

  return {
    data: await attachProductShopNames((data ?? []) as PublicProduct[]),
    error: null,
  };
}

async function attachProductShopNames(products: PublicProduct[]): Promise<PublicProduct[]> {
  if (products.length === 0) return products;
  const found = await lookupShopProfiles(products.map((p) => p.business_id));
  return products.map((p) => {
    const shop = found.get(p.business_id);
    return {
      ...p,
      business_name: displayShopName(shop?.business_name ?? p.business_name),
      business_slug: shop?.slug ?? p.business_slug ?? p.business_id,
      business_logo_url: shop?.logo_url ?? p.business_logo_url,
    };
  });
}

/** Published informal businesses for marketplace landing — includes shops without products. */
export async function fetchMarketplaceShops(limit = 200): Promise<{
  shops: MarketplaceShop[];
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  let { data, error } = await supabase
    .from("public_marketplace_businesses")
    .select(MARKETPLACE_SHOP_SELECT)
    .order("business_name")
    .limit(limit);

  if (error) {
    const fallback = await supabase
      .from("public_business_listings")
      .select(MARKETPLACE_SHOP_SELECT)
      .order("business_name")
      .limit(limit);
    if (fallback.error) {
      const core = await supabase
        .from("public_business_listings")
        .select(MARKETPLACE_SHOP_SELECT_CORE)
        .order("business_name")
        .limit(limit);
      if (core.error) {
        const legacy = await supabase
          .from("public_business_listings")
          .select(
            "id, slug, business_name, description, location_text, public_location_label, latitude, longitude, logo_url, category_id, category_name, public_phone, public_whatsapp, opening_hours, is_verified, verification_status",
          )
          .order("business_name")
          .limit(limit);
        if (legacy.error) return { shops: [], error: legacy.error.message };
        data = legacy.data;
      } else {
        data = core.data;
      }
    } else {
      data = fallback.data;
    }
    error = null;
  }

  const rows = (data ?? []) as PublicBusiness[];
  const { data: productRows } = await supabase
    .from("public_business_products")
    .select("business_id, name")
    .limit(2000);

  const namesByBiz = new Map<string, string[]>();
  for (const row of productRows ?? []) {
    const list = namesByBiz.get(row.business_id as string) ?? [];
    list.push(row.name as string);
    namesByBiz.set(row.business_id as string, list);
  }

  return {
    shops: rows.map((b) => {
      const names = namesByBiz.get(b.id) ?? [];
      return { ...b, product_names: names, product_count: names.length };
    }),
    error: null,
  };
}

function sanitizeSearchNeedle(query: string): string {
  return query
    .trim()
    .replace(/^@+/, "")
    .replace(/[%_,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
}

async function attachShopProductNames(rows: PublicBusiness[]): Promise<MarketplaceShop[]> {
  if (rows.length === 0) return [];
  const supabase = getSupabaseBrowserClient();
  const { data: productRows } = await supabase
    .from("public_business_products")
    .select("business_id, name")
    .in(
      "business_id",
      rows.map((b) => b.id),
    )
    .limit(2000);
  const namesByBiz = new Map<string, string[]>();
  for (const row of productRows ?? []) {
    const list = namesByBiz.get(row.business_id as string) ?? [];
    list.push(row.name as string);
    namesByBiz.set(row.business_id as string, list);
  }
  return rows.map((b) => {
    const names = namesByBiz.get(b.id) ?? [];
    return { ...b, product_names: names, product_count: names.length };
  });
}

/** Find shops by name, @username, description, or informal words like suya even with no category. */
export async function searchMarketplaceShops(query: string): Promise<{
  shops: MarketplaceShop[];
  error: string | null;
}> {
  const terms = [...new Set(expandSearchTerms(query).map(sanitizeSearchNeedle).filter((t) => t.length >= 2))].slice(0, 6);
  if (terms.length === 0) return { shops: [], error: null };
  const supabase = getSupabaseBrowserClient();
  const or = terms
    .flatMap((t) => [`business_name.ilike.%${t}%`, `slug.ilike.%${t}%`, `description.ilike.%${t}%`])
    .join(",");
  let { data, error } = await supabase.from("public_marketplace_businesses").select(MARKETPLACE_SHOP_SELECT).or(or).limit(60);
  if (error) {
    const fallback = await supabase.from("public_business_listings").select(MARKETPLACE_SHOP_SELECT).or(or).limit(60);
    data = fallback.data;
    error = fallback.error;
  }
  if (error) {
    const core = await supabase.from("public_business_listings").select(MARKETPLACE_SHOP_SELECT_CORE).or(or).limit(60);
    if (core.error) return { shops: [], error: core.error.message };
    data = core.data;
  }
  return { shops: await attachShopProductNames((data ?? []) as PublicBusiness[]), error: null };
}

export async function searchMarketplaceProducts(query: string): Promise<{
  data: PublicProduct[];
  error: string | null;
}> {
  const terms = [...new Set(expandSearchTerms(query).map(sanitizeSearchNeedle).filter((t) => t.length >= 2))].slice(0, 6);
  if (terms.length === 0) return { data: [], error: null };
  const supabase = getSupabaseBrowserClient();
  const or = terms
    .flatMap((t) => [
      `name.ilike.%${t}%`,
      `description.ilike.%${t}%`,
      `business_name.ilike.%${t}%`,
      `business_slug.ilike.%${t}%`,
    ])
    .join(",");
  const { data, error } = await supabase.from("public_business_products").select(MARKETPLACE_PRODUCT_SELECT).or(or).limit(60);
  if (error) {
    const retry = await supabase
      .from("public_business_products")
      .select(MARKETPLACE_PRODUCT_SELECT_LEGACY)
      .or(terms.map((t) => `name.ilike.%${t}%`).join(","))
      .limit(60);
    if (retry.error) return { data: [], error: retry.error.message };
    return { data: await attachProductShopNames((retry.data ?? []) as PublicProduct[]), error: null };
  }
  return { data: await attachProductShopNames((data ?? []) as PublicProduct[]), error: null };
}

/** Published shops with a map position, ranked from the shopper’s location. */
export async function fetchNearbyMarketplaceShops(input: {
  lat: number;
  lng: number;
  radiusKm?: number;
  limit?: number;
}): Promise<{ shops: NearbyMarketplaceShop[]; error: string | null }> {
  const radiusKm = input.radiusKm ?? 50;
  const centre = { lat: input.lat, lng: input.lng };
  const includeAll = !Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm >= 500;

  const [listingsRes, productsRes] = await Promise.all([
    fetchMarketplaceShops(800),
    fetchMarketplaceProducts(400).catch(() => ({ data: [] as PublicProduct[], error: null })),
  ]);

  if (listingsRes.error) return { shops: [], error: listingsRes.error };

  const productsByBiz = new Map<string, PublicProduct[]>();
  for (const p of productsRes.data ?? []) {
    const list = productsByBiz.get(p.business_id) ?? [];
    list.push(p);
    productsByBiz.set(p.business_id, list);
  }

  const shops: NearbyMarketplaceShop[] = [];
  for (const listing of listingsRes.shops) {
    const coords = resolveShopMapCoords(listing);
    if (!coords) continue;
    const distance_km = haversineKm(centre, coords);
    if (!includeAll && distance_km > radiusKm) continue;
    shops.push({
      ...listing,
      map_lat: coords.lat,
      map_lng: coords.lng,
      location_estimated: coords.estimated,
      distance_km,
      products: productsByBiz.get(listing.id) ?? [],
    });
  }

  shops.sort((a, b) => a.distance_km - b.distance_km);
  return { shops: shops.slice(0, input.limit ?? 250), error: null };
}

/**
 * Find businesses and services in a user's own area (state / LGA) plus an
 * optional keyword — e.g. a barber in the same local government — so the
 * shopper can open a profile and call them to come and do the job.
 */
export async function searchLocalBusinesses(input: {
  state?: string | null;
  lga?: string | null;
  keyword?: string | null;
  limit?: number;
}): Promise<{ shops: PublicBusiness[]; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const baseSelect =
    "id, slug, business_name, description, location_text, public_location_label, latitude, longitude, logo_url, cover_image_url, category_id, category_name, public_phone, public_whatsapp, opening_hours, is_verified, verification_status, is_informal";
  let { data, error } = await supabase
    .from("public_marketplace_businesses")
    .select(`${baseSelect}, is_personal`)
    .order("business_name")
    .limit(500);
  if (error && /is_personal|schema cache|column/i.test(error.message)) {
    const retry = await supabase
      .from("public_marketplace_businesses")
      .select(baseSelect)
      .order("business_name")
      .limit(500);
    data = retry.data;
    error = retry.error;
  }
  if (error) {
    const fallback = await supabase
      .from("public_business_listings")
      .select(baseSelect)
      .order("business_name")
      .limit(500);
    if (fallback.error) return { shops: [], error: fallback.error.message };
    data = fallback.data;
  }

  const rows = (data ?? []) as PublicBusiness[];
  const state = input.state?.trim() ?? "";
  const lga = input.lga?.trim() ?? "";
  const hasArea = Boolean(state || lga);
  const keyword = input.keyword?.trim().toLowerCase() ?? "";
  const words = keyword.split(/\s+/).filter(Boolean);

  const scored: Array<{ shop: PublicBusiness; rank: number }> = [];
  for (const shop of rows) {
    const hay = [
      shop.business_name,
      shop.description ?? "",
      shop.category_name ?? "",
      shop.custom_category ?? "",
      shop.location_text ?? "",
      shop.public_location_label ?? "",
    ]
      .join(" ")
      .toLowerCase();
    if (words.length > 0 && !words.every((w) => hay.includes(w))) continue;

    let rank = 0;
    if (hasArea) {
      const place = shop.public_location_label ?? shop.location_text;
      if (!locationMatchesArea(place, { state, lga })) continue;
      rank = 1;
      if (lga && place?.toLowerCase().includes(lga.toLowerCase())) rank = 2;
    }
    scored.push({ shop, rank });
  }

  scored.sort(
    (a, b) => b.rank - a.rank || a.shop.business_name.localeCompare(b.shop.business_name),
  );
  return { shops: scored.slice(0, input.limit ?? 60).map((s) => s.shop), error: null };
}

/**
 * Open (or create) the caller's own shop profile. Used when someone without a
 * registered business sells a second-hand item from their house: the shop is
 * flagged as personal so it stays separate from a full business account.
 */
export async function ensurePersonalShop(input: {
  profileId: string;
  displayName?: string | null;
  location?: string | null;
  phone?: string | null;
  categoryId?: string | null;
}): Promise<{ businessId: string | null; slug: string | null; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const phone = input.phone?.trim() || null;
  const location = input.location?.trim() || null;
  const categoryId = input.categoryId?.trim() || null;

  const existing = await supabase
    .from("businesses")
    .select("id, public_slug, public_phone, public_whatsapp, category_id")
    .eq("owner_id", input.profileId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing.data?.id) {
    const businessId = existing.data.id as string;
    await ensureOwnerMembership(businessId, input.profileId);
    const patch: Record<string, string> = {};
    if (phone && !existing.data.public_phone) patch.public_phone = phone;
    if (phone && !existing.data.public_whatsapp) patch.public_whatsapp = phone;
    if (location) patch.location = location;
    if (categoryId) patch.category_id = categoryId;
    if (Object.keys(patch).length > 0) {
      await supabase.from("businesses").update(patch).eq("id", businessId);
    }
    return { businessId, slug: (existing.data.public_slug as string | null) ?? null, error: null };
  }

  const baseName = input.displayName?.trim() || "My items";
  const row: Record<string, unknown> = {
    owner_id: input.profileId,
    business_name: baseName,
    location,
    public_phone: phone,
    public_whatsapp: phone,
    category_id: categoryId,
    is_informal: true,
    is_personal: true,
    islamic_mode_enabled: false,
  };
  let created = await supabase.from("businesses").insert(row).select("id, public_slug").single();
  if (created.error && /is_personal|is_informal|column|schema cache/i.test(created.error.message)) {
    const { is_personal: _p, is_informal: _i, ...fallbackRow } = row;
    created = await supabase
      .from("businesses")
      .insert(fallbackRow)
      .select("id, public_slug")
      .single();
  }
  const businessId = (created.data?.id as string | undefined) ?? null;
  if (created.error || !businessId) {
    return { businessId: null, slug: null, error: created.error?.message ?? "Could not open your selling profile." };
  }
  await ensureOwnerMembership(businessId, input.profileId);
  return { businessId, slug: (created.data?.public_slug as string | null) ?? null, error: null };
}

export async function fetchMarketplaceProduct(productId: string): Promise<{
  product: PublicProduct | null;
  error: string | null;
}> {
  if (isMockFeedId(productId)) {
    return { product: null, error: "This listing is not available." };
  }

  const supabase = getSupabaseBrowserClient();
  let { data, error } = await supabase
    .from("public_business_products")
    .select(MARKETPLACE_PRODUCT_SELECT)
    .eq("id", productId)
    .maybeSingle();

  if (error) {
    const legacy = await supabase
      .from("public_business_products")
      .select(MARKETPLACE_PRODUCT_SELECT_LEGACY)
      .eq("id", productId)
      .maybeSingle();
    if (legacy.error) return { product: null, error: legacy.error.message };
    data = legacy.data;
    error = null;
  }

  if (error) return { product: null, error: error.message };
  if (!data) return { product: null, error: "This product is not available." };

  const product = data as PublicProduct;
  if (product.is_informal === false) {
    return { product: null, error: "This product is not available on the informal marketplace." };
  }

  if (!product.business_name || !product.business_slug) {
    const { data: listing } = await supabase
      .from("public_business_listings")
      .select("id, slug, business_name, is_informal")
      .eq("id", product.business_id)
      .maybeSingle();
    if (listing?.is_informal === false) {
      return { product: null, error: "This product is not available on the informal marketplace." };
    }
    const filled = await attachProductShopNames([
      {
        ...product,
        business_name: (listing?.business_name as string) ?? product.business_name,
        business_slug: (listing?.slug as string) ?? product.business_slug,
        is_informal: (listing?.is_informal as boolean | undefined) ?? product.is_informal ?? true,
      },
    ]);
    return { product: filled[0] ?? product, error: null };
  }

  const named = await attachProductShopNames([product]);
  return { product: named[0] ?? product, error: null };
}

/* ------------------------------------------------------------------ *
 * Product social engagement: likes, comments, and shares on shop posts.
 * ------------------------------------------------------------------ */

export type ProductComment = {
  id: string;
  product_id: string;
  profile_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  author_name?: string;
};

export type ProductEngagement = {
  like_count: number;
  comment_count: number;
  share_count: number;
};

const EMPTY_ENGAGEMENT: ProductEngagement = { like_count: 0, comment_count: 0, share_count: 0 };

function productSocialMissing(message: string | undefined): boolean {
  return !message || /product_comments|product_likes|like_count|comment_count|share_count|schema cache|does not exist/i.test(message);
}

export async function fetchProductEngagement(productId: string): Promise<ProductEngagement> {
  if (isMockFeedId(productId)) return EMPTY_ENGAGEMENT;
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("public_business_products")
    .select("like_count, comment_count, share_count")
    .eq("id", productId)
    .maybeSingle();
  if (error || !data) return EMPTY_ENGAGEMENT;
  const row = data as { like_count?: number | null; comment_count?: number | null; share_count?: number | null };
  return {
    like_count: Number(row.like_count ?? 0),
    comment_count: Number(row.comment_count ?? 0),
    share_count: Number(row.share_count ?? 0),
  };
}

export async function fetchMyLikedProductIds(profileId: string): Promise<Set<string>> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.from("product_likes").select("product_id").eq("profile_id", profileId);
  if (error) return new Set();
  return new Set((data ?? []).map((row) => row.product_id as string));
}

export async function toggleProductLikeDb(
  profileId: string,
  productId: string,
): Promise<{ liked: boolean; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { data: existing } = await supabase
    .from("product_likes")
    .select("profile_id")
    .eq("profile_id", profileId)
    .eq("product_id", productId)
    .maybeSingle();
  if (existing) {
    const { error } = await supabase.from("product_likes").delete().eq("profile_id", profileId).eq("product_id", productId);
    return { liked: false, error: productSocialMissing(error?.message) ? "Likes are not set up yet. Apply migration 000048." : error?.message ?? null };
  }
  const { error } = await supabase.from("product_likes").insert({ profile_id: profileId, product_id: productId });
  if (error?.code === "23505") return { liked: true, error: null };
  if (error && productSocialMissing(error.message)) return { liked: false, error: "Likes are not set up yet. Apply migration 000048." };
  return { liked: true, error: error?.message ?? null };
}

export async function likeMarketplaceProduct(profileId: string, productId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("product_likes").insert({ profile_id: profileId, product_id: productId });
  if (error && error.code !== "23505") return { error: error.message };
  return { error: null };
}

export async function unlikeMarketplaceProduct(profileId: string, productId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("product_likes").delete().eq("profile_id", profileId).eq("product_id", productId);
  if (error && productSocialMissing(error.message)) return { error: "Likes are not set up yet. Apply migration 000048." };
  return { error: error?.message ?? null };
}

export async function fetchProductComments(
  productId: string,
): Promise<{ comments: ProductComment[]; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("product_comments")
    .select("id, product_id, profile_id, parent_id, body, created_at")
    .eq("product_id", productId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) {
    return {
      comments: [],
      error: productSocialMissing(error.message) ? "Comments are not set up yet. Apply migration 000048." : error.message,
    };
  }
  const comments = (data ?? []) as ProductComment[];
  const ids = [...new Set(comments.map((c) => c.profile_id))];
  if (ids.length === 0) return { comments, error: null };
  const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", ids);
  const names = new Map((profiles ?? []).map((p) => [p.id as string, p.full_name as string]));
  return {
    comments: comments.map((c) => ({ ...c, author_name: names.get(c.profile_id) ?? "Shopper" })),
    error: null,
  };
}

export async function postProductComment(input: {
  profileId: string;
  productId: string;
  body: string;
  parentId?: string | null;
}): Promise<{ error: string | null }> {
  const text = input.body.trim();
  if (!text) return { error: "Write a comment first." };
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("product_comments").insert({
    profile_id: input.profileId,
    product_id: input.productId,
    parent_id: input.parentId ?? null,
    body: text,
  });
  if (error && productSocialMissing(error.message)) return { error: "Comments are not set up yet. Apply migration 000048." };
  return { error: error?.message ?? null };
}

export async function updateProductComment(input: {
  commentId: string;
  profileId: string;
  body: string;
}): Promise<{ error: string | null }> {
  const text = input.body.trim();
  if (!text) return { error: "Write a comment first." };
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from("product_comments")
    .update({ body: text })
    .eq("id", input.commentId)
    .eq("profile_id", input.profileId);
  if (error && productSocialMissing(error.message)) return { error: "Comments are not set up yet. Apply migration 000059." };
  return { error: error?.message ?? null };
}

export async function deleteProductComment(input: {
  commentId: string;
  profileId: string;
}): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from("product_comments")
    .delete()
    .eq("id", input.commentId)
    .eq("profile_id", input.profileId);
  if (error && productSocialMissing(error.message)) return { error: "Comments are not set up yet. Apply migration 000048." };
  return { error: error?.message ?? null };
}

/* ------------------------------------------------------------------ *
 * Product reviews: one rating (1-5) plus an optional note per shopper.
 * ------------------------------------------------------------------ */

export type ProductReview = {
  id: string;
  product_id: string;
  profile_id: string;
  rating: number;
  body: string | null;
  created_at: string;
  updated_at: string;
  author_name?: string;
};

export type ProductReviewSummary = {
  average: number | null;
  count: number;
};

function productReviewMissing(message: string | undefined): boolean {
  return !message || /product_reviews|schema cache|does not exist/i.test(message);
}

export async function fetchProductReviews(
  productId: string,
): Promise<{ reviews: ProductReview[]; summary: ProductReviewSummary; error: string | null }> {
  const empty: ProductReviewSummary = { average: null, count: 0 };
  if (isMockFeedId(productId)) return { reviews: [], summary: empty, error: null };
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("product_reviews")
    .select("id, product_id, profile_id, rating, body, created_at, updated_at")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    return {
      reviews: [],
      summary: empty,
      error: productReviewMissing(error.message)
        ? "Reviews are not set up yet. Apply migration 000060."
        : error.message,
    };
  }
  const rows = (data ?? []) as ProductReview[];
  const ids = [...new Set(rows.map((r) => r.profile_id))];
  let names = new Map<string, string>();
  if (ids.length) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", ids);
    names = new Map((profiles ?? []).map((p) => [p.id as string, (p.full_name as string) ?? "Shopper"]));
  }
  const reviews = rows.map((r) => ({ ...r, author_name: names.get(r.profile_id) ?? "Shopper" }));
  const average = reviews.length
    ? reviews.reduce((total, r) => total + Number(r.rating), 0) / reviews.length
    : null;
  return { reviews, summary: { average, count: reviews.length }, error: null };
}

export async function submitProductReview(input: {
  productId: string;
  profileId: string;
  rating: number;
  body?: string | null;
}): Promise<{ error: string | null }> {
  const rating = Math.round(Number(input.rating));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return { error: "Pick a rating from 1 to 5 stars." };
  }
  const trimmed = input.body?.trim() ?? "";
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("product_reviews").upsert(
    {
      product_id: input.productId,
      profile_id: input.profileId,
      rating,
      body: trimmed ? trimmed : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "product_id,profile_id" },
  );
  if (error && productReviewMissing(error.message)) {
    return { error: "Reviews are not set up yet. Apply migration 000060." };
  }
  return { error: error?.message ?? null };
}

export async function deleteProductReview(input: {
  productId: string;
  profileId: string;
}): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from("product_reviews")
    .delete()
    .eq("product_id", input.productId)
    .eq("profile_id", input.profileId);
  if (error && productReviewMissing(error.message)) {
    return { error: "Reviews are not set up yet. Apply migration 000060." };
  }
  return { error: error?.message ?? null };
}

export async function recordProductShare(productId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  await supabase.rpc("record_product_share", { p_product_id: productId });
}
export function productShareUrl(productId: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/shop/p/${productId}`;
}

function missingDbColumn(message: string | undefined, column: string): boolean {
  if (!message) return false;
  return new RegExp(`${column}|schema cache`, "i").test(message) && /schema cache|does not exist|column/i.test(message);
}

function shouldPlaceOrderDirectly(message: string | undefined): boolean {
  if (!message) return false;
  return (
    missingDbColumn(message, "variant_id") ||
    /insufficient stock/i.test(message) ||
    /order_checkout_keys/i.test(message) ||
    /relation .* does not exist/i.test(message)
  );
}

async function getOrCreateActiveCart(profileId: string): Promise<{ cartId: string | null; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { data: existing } = await supabase
    .from("carts")
    .select("id")
    .eq("profile_id", profileId)
    .eq("status", "active")
    .maybeSingle();
  if (existing?.id) return { cartId: existing.id as string, error: null };

  const { data, error } = await supabase
    .from("carts")
    .insert({ profile_id: profileId, status: "active" })
    .select("id")
    .single();
  if (error) return { cartId: null, error: error.message };
  return { cartId: data.id as string, error: null };
}

async function fetchLiveCartItems(profileId: string): Promise<CartItem[] | null> {
  const { cartId, error: cartError } = await getOrCreateActiveCart(profileId);
  if (cartError || !cartId) return null;
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.from("cart_items").select("*").eq("cart_id", cartId).order("created_at");
  if (error) return null;
  return (data ?? []) as CartItem[];
}

export async function fetchCart(profileId: string): Promise<{
  items: CartItem[];
  error: string | null;
}> {
  const local = listLocalCart(profileId);
  if (!profileId || profileId === "guest") return { items: local, error: null };

  const live = await Promise.race([
    fetchLiveCartItems(profileId),
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 1800);
    }),
  ]);
  if (!live) return { items: local, error: null };
  const liveIds = new Set(live.map((i) => `${i.product_id}:${i.variant_id ?? ""}`));
  const extras = local.filter((i) => !liveIds.has(`${i.product_id}:${i.variant_id ?? ""}`));
  return { items: [...extras, ...live], error: null };
}

export async function addToCart(
  profileId: string,
  input: {
    businessId: string;
    productId: string;
    productName: string;
    unit: string;
    unitPrice: number;
    quantity?: number;
    imageUrl?: string | null;
    variantId?: string | null;
    variantLabel?: string | null;
  },
): Promise<{ error: string | null }> {
  if (isMockFeedId(input.productId)) {
    return { error: "This listing is not available." };
  }
  if (!profileId || profileId === "guest") {
    return { error: "Sign in to add items to your cart." };
  }
  addLocalCartItem(profileId, input);
  rememberSavedFromCart(profileId, input);
  const supabase = getSupabaseBrowserClient();
  const qty = input.quantity ?? 1;
  const rpcArgs: { p_product_id: string; p_quantity: number; p_variant_id?: string } = {
    p_product_id: input.productId,
    p_quantity: qty,
  };
  if (input.variantId) rpcArgs.p_variant_id = input.variantId;
  const rpc = await supabase.rpc("add_marketplace_cart_item", rpcArgs);
  if (!rpc.error) return { error: null };

  const { cartId, error: cartError } = await getOrCreateActiveCart(profileId);
  if (cartError || !cartId) return { error: cartError ?? "Could not open cart." };

  const live = await fetchMarketplaceProduct(input.productId);
  if (live.error) return { error: live.error };
  if (!live.product?.is_available) return { error: "This product is not available." };
  if (live.product.sale_price == null) return { error: "This listing has no price — send an enquiry instead." };

  const { data: existing } = await supabase
    .from("cart_items")
    .select("id, quantity")
    .eq("cart_id", cartId)
    .eq("product_id", input.productId)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from("cart_items")
      .update({
        quantity: Number(existing.quantity) + qty,
        unit_price: Number(live.product.sale_price),
        product_name: live.product.name,
      })
      .eq("id", existing.id);
    return { error: error?.message ?? null };
  }

  const { error } = await supabase.from("cart_items").insert({
    cart_id: cartId,
    business_id: live.product.business_id,
    product_id: input.productId,
    quantity: qty,
    unit_price: Number(live.product.sale_price),
    product_name: live.product.name,
    unit: live.product.unit,
    image_url: live.product.image_url ?? null,
  });
  if (error?.code === "23505") return { error: null };
  return { error: error?.message ?? null };
}

function rememberSavedFromCart(
  profileId: string,
  input: {
    businessId: string;
    productId: string;
    productName: string;
    unit: string;
    unitPrice: number;
    imageUrl?: string | null;
  },
) {
  ensureSavedProduct(
    profileId,
    {
      id: input.productId,
      business_id: input.businessId,
      name: input.productName,
      kind: "goods",
      description: null,
      sale_price: input.unitPrice,
      unit: input.unit,
      image_url: input.imageUrl ?? null,
      is_available: true,
    },
  );
}

export async function updateCartItemQuantity(
  itemId: string,
  quantity: number,
  profileId?: string | null,
): Promise<{ error: string | null }> {
  if (isLocalCartId(itemId) || !profileId || profileId === "guest") {
    updateLocalCartQuantity(itemId, quantity, profileId);
    return { error: null };
  }
  const supabase = getSupabaseBrowserClient();
  if (quantity <= 0) {
    const { error } = await supabase.from("cart_items").delete().eq("id", itemId);
    if (!error) updateLocalCartQuantity(itemId, 0, profileId);
    return { error: error?.message ?? null };
  }
  const { error } = await supabase.from("cart_items").update({ quantity }).eq("id", itemId);
  if (!error) updateLocalCartQuantity(itemId, quantity, profileId);
  return { error: error?.message ?? null };
}

export async function removeCartItem(itemId: string, profileId?: string | null): Promise<{ error: string | null }> {
  if (isLocalCartId(itemId) || !profileId || profileId === "guest") {
    removeLocalCartItem(itemId, profileId);
    return { error: null };
  }
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("cart_items").delete().eq("id", itemId);
  if (!error) removeLocalCartItem(itemId, profileId);
  return { error: error?.message ?? null };
}

export async function quoteCheckout(
  fulfilment: "pickup" | "seller_delivery" | "third_party",
): Promise<{ quote: CheckoutQuote | null; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("quote_marketplace_checkout", {
    p_fulfilment: fulfilment,
  });
  if (error) return { quote: null, error: error.message };
  return { quote: data as CheckoutQuote, error: null };
}

async function placeOrdersWithoutVariants(input: {
  fulfilment?: "pickup" | "seller_delivery" | "third_party";
  addressId?: string | null;
  buyerNote?: string;
  buyerPhone?: string;
  paymentMethod?: string | null;
  paymentDestination?: string | null;
  deliveryBusinessId?: string | null;
  deliveryFee?: number | null;
}): Promise<{ orders: MarketplaceOrder[]; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { data: auth } = await supabase.auth.getUser();
  const profileId = auth.user?.id;
  if (!profileId) return { orders: [], error: "Sign in to place an order." };

  let items = (await fetchLiveCartItems(profileId)) ?? [];
  if (items.length === 0) {
    const local = listLocalCart(profileId);
    for (const line of local) {
      const added = await addToCart(profileId, {
        businessId: line.business_id,
        productId: line.product_id,
        productName: line.product_name,
        unit: line.unit,
        unitPrice: Number(line.unit_price),
        quantity: Number(line.quantity),
        imageUrl: line.image_url,
      });
      if (added.error && !missingDbColumn(added.error, "variant_id")) {
        return { orders: [], error: added.error };
      }
    }
    items = (await fetchLiveCartItems(profileId)) ?? local;
  }
  if (items.length === 0) return { orders: [], error: "Your cart is empty." };

  const byShop = new Map<string, CartItem[]>();
  for (const line of items) {
    const list = byShop.get(line.business_id) ?? [];
    list.push(line);
    byShop.set(line.business_id, list);
  }

  const orders: MarketplaceOrder[] = [];
  for (const [businessId, lines] of byShop) {
    const shopFee = await supabase.from("businesses").select("delivery_fee").eq("id", businessId).maybeSingle();
    const chosen = input.fulfilment === "pickup" ? 0 : input.deliveryFee;
    const delivery =
      chosen != null
        ? Math.max(0, Number(chosen))
        : input.fulfilment === "pickup"
          ? 0
          : Math.max(0, Number(shopFee.data?.delivery_fee ?? 0));
    const subtotal = lines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unit_price), 0);
    const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, "");
    const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
    const payload: Record<string, unknown> = {
      order_number: `TJ-${stamp}-${suffix}`,
      buyer_profile_id: profileId,
      business_id: businessId,
      status: "pending_payment",
      fulfilment: input.fulfilment ?? "pickup",
      delivery_address_id: input.addressId ?? null,
      subtotal,
      delivery_fee: delivery,
      delivery_business_id: input.deliveryBusinessId ?? null,
      total: subtotal + delivery,
      buyer_phone: input.buyerPhone ?? null,
      buyer_note: input.buyerNote ?? null,
    };
    let { data: order, error } = await supabase.from("orders").insert(payload).select("*").single();
    if (error && /delivery_business_id/i.test(error.message)) {
      delete payload.delivery_business_id;
      const retry = await supabase.from("orders").insert(payload).select("*").single();
      order = retry.data;
      error = retry.error;
    }
    if (error || !order) return { orders, error: error?.message ?? "Could not create the order." };

    const { error: itemError } = await supabase.from("order_items").insert(
      lines.map((line) => ({
        order_id: order.id,
        product_id: line.product_id,
        product_name: line.product_name,
        unit: line.unit,
        quantity: line.quantity,
        unit_price: line.unit_price,
        line_total: Number(line.quantity) * Number(line.unit_price),
        image_url: line.image_url,
      })),
    );
    if (itemError) return { orders, error: itemError.message };

    await supabase.from("payments").insert({
      order_id: order.id,
      provider: "test",
      status: "initiated",
      amount: Number(order.total),
      test_mode: true,
    });
    orders.push(order as MarketplaceOrder);
  }

  const { cartId } = await getOrCreateActiveCart(profileId);
  if (cartId) {
    await supabase.from("carts").update({ status: "converted" }).eq("id", cartId);
  }
  return { orders, error: null };
}

export async function placeOrders(input: {
  fulfilment?: "pickup" | "seller_delivery" | "third_party";
  addressId?: string | null;
  buyerNote?: string;
  buyerPhone?: string;
  idempotencyKey: string;
  paymentMethod?: string | null;
  paymentDestination?: string | null;
  deliveryBusinessId?: string | null;
  deliveryFee?: number | null;
  deliveryName?: string | null;
}): Promise<{ orders: MarketplaceOrder[]; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const payload = {
    p_fulfilment: input.fulfilment ?? "pickup",
    p_address_id: input.addressId ?? null,
    p_buyer_note: input.buyerNote ?? null,
    p_buyer_phone: input.buyerPhone ?? null,
    p_idempotency_key: input.idempotencyKey,
  };
  let { data, error } = await supabase.rpc("place_marketplace_orders", payload);
  if (
    error &&
    /p_idempotency_key|function.*place_marketplace_orders|order_checkout_keys/i.test(error.message)
  ) {
    const legacy = await supabase.rpc("place_marketplace_orders", {
      p_fulfilment: payload.p_fulfilment,
      p_address_id: payload.p_address_id,
      p_buyer_note: payload.p_buyer_note,
      p_buyer_phone: payload.p_buyer_phone,
    });
    data = legacy.data;
    error = legacy.error;
  }
  if (error && shouldPlaceOrderDirectly(error.message)) {
    const fallback = await placeOrdersWithoutVariants(input);
    if (fallback.error || fallback.orders.length === 0) {
      return { orders: [], error: fallback.error ?? error.message };
    }
    data = fallback.orders;
    error = null;
  }
  if (error) return { orders: [], error: error.message };
  const orders = (data ?? []) as MarketplaceOrder[];
  if (orders.length > 0) {
    const supabasePay = getSupabaseBrowserClient();
    const deliveryFee = input.fulfilment === "pickup" ? 0 : Math.max(0, Number(input.deliveryFee ?? 0));
    await Promise.all(
      orders.map(async (order) => {
        const patch: Record<string, unknown> = {};
        if (input.paymentMethod) {
          patch.payment_method = input.paymentMethod;
          patch.payment_destination = input.paymentDestination ?? null;
        }
        if (input.fulfilment && input.fulfilment !== "pickup") {
          patch.delivery_fee = deliveryFee;
          patch.total = Number(order.subtotal ?? 0) + deliveryFee;
          if (input.deliveryBusinessId) patch.delivery_business_id = input.deliveryBusinessId;
        }
        if (Object.keys(patch).length === 0) return;
        const updated = await supabasePay.from("orders").update(patch).eq("id", order.id).select("*").maybeSingle();
        if (updated.error && /delivery_business_id/i.test(updated.error.message)) {
          delete patch.delivery_business_id;
          await supabasePay.from("orders").update(patch).eq("id", order.id);
        } else if (updated.data) {
          Object.assign(order, updated.data);
        } else {
          Object.assign(order, patch);
        }
      }),
    );
  }
  return { orders, error: null };
}

/**
 * "Buy now" — order a single product directly, without touching the cart.
 * The shop is notified (in-app + push) by the orders trigger.
 */
export async function placeBuyNowOrder(input: {
  productId: string;
  quantity?: number;
  variantId?: string | null;
  fulfilment?: "pickup" | "seller_delivery" | "third_party";
  buyerPhone?: string;
  buyerNote?: string;
  idempotencyKey: string;
}): Promise<{ order: MarketplaceOrder | null; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("place_buy_now_order", {
    p_product_id: input.productId,
    p_quantity: input.quantity ?? 1,
    p_variant_id: input.variantId ?? null,
    p_fulfilment: input.fulfilment ?? "pickup",
    p_buyer_phone: input.buyerPhone ?? null,
    p_buyer_note: input.buyerNote ?? null,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) return { order: null, error: error.message };
  const raw = data as MarketplaceOrder | MarketplaceOrder[] | null;
  const order = Array.isArray(raw) ? (raw[0] ?? null) : raw;
  if (!order) return { order: null, error: "Could not place the order." };
  return { order, error: null };
}

export async function transitionOrder(
  orderId: string,
  nextStatus: string,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("transition_marketplace_order", {
    p_order_id: orderId,
    p_new_status: nextStatus,
  });
  return { error: error?.message ?? null };
}

export async function markBuyerTransferPaid(orderId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("buyer_mark_transfer_paid", { p_order_id: orderId });
  return { error: error?.message ?? null };
}

/** Kept for older screens. Always refuses to mark paid from the client. */
export async function completeTestPayment(_orderId: string): Promise<{
  order: MarketplaceOrder | null;
  error: string | null;
}> {
  if (!isLivePaymentConfigured()) {
    return {
      order: null,
      error: "Payment is not live. This stays an order request until Paystack or Flutterwave is connected.",
    };
  }
  return { order: null, error: "Use the payment webhook — the app cannot mark an order paid." };
}

export async function fetchMyOrders(profileId?: string | null): Promise<{ orders: MarketplaceOrder[]; error: string | null }> {
  const local = listLocalOrders(profileId);
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return { orders: local, error: local.length ? null : error.message };
  const live = (data ?? []) as MarketplaceOrder[];
  const ids = new Set(live.map((o) => o.id));
  return { orders: [...local.filter((o) => !ids.has(o.id)), ...live], error: null };
}

export async function fetchOrderDetail(orderId: string, profileId?: string | null): Promise<{
  order: MarketplaceOrder | null;
  items: MarketplaceOrderItem[];
  error: string | null;
}> {
  const local = getLocalOrder(profileId, orderId) ?? getLocalOrder("guest", orderId);
  if (local) return { ...local, error: null };
  const supabase = getSupabaseBrowserClient();
  const { data: order, error } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (error) return { order: null, items: [], error: error.message };
  if (!order) return { order: null, items: [], error: null };
  const { data: items, error: iErr } = await supabase.from("order_items").select("*").eq("order_id", orderId);
  if (iErr) return { order: order as MarketplaceOrder, items: [], error: iErr.message };
  return { order: order as MarketplaceOrder, items: (items ?? []) as MarketplaceOrderItem[], error: null };
}

export async function listAddresses(profileId: string): Promise<{
  data: CustomerAddress[];
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("customer_addresses")
    .select("*")
    .eq("profile_id", profileId)
    .order("is_default", { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as CustomerAddress[], error: null };
}

export async function saveAddress(
  profileId: string,
  input: Omit<CustomerAddress, "id" | "profile_id"> & { id?: string },
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const row = {
    profile_id: profileId,
    label: input.label,
    full_name: input.full_name,
    phone: input.phone,
    state: input.state,
    city: input.city,
    lga: input.lga,
    street: input.street,
    instructions: input.instructions,
    is_default: input.is_default,
  };
  if (input.id) {
    const { error } = await supabase.from("customer_addresses").update(row).eq("id", input.id);
    return { error: error?.message ?? null };
  }
  const { error } = await supabase.from("customer_addresses").insert(row);
  return { error: error?.message ?? null };
}

export async function toggleFavoriteProduct(
  profileId: string,
  productId: string,
): Promise<{ favorited: boolean; error: string | null }> {
  if (isMockFeedId(productId)) {
    return { favorited: false, error: "This listing is not available." };
  }
  const supabase = getSupabaseBrowserClient();
  const { data: existing } = await supabase
    .from("marketplace_favorites")
    .select("id")
    .eq("profile_id", profileId)
    .eq("product_id", productId)
    .maybeSingle();
  if (existing?.id) {
    const { error } = await supabase.from("marketplace_favorites").delete().eq("id", existing.id);
    return { favorited: false, error: error?.message ?? null };
  }
  const { error } = await supabase.from("marketplace_favorites").insert({
    profile_id: profileId,
    product_id: productId,
  });
  return { favorited: true, error: error?.message ?? null };
}

export async function fetchFavoriteProducts(profileId: string): Promise<{
  products: PublicProduct[];
  error: string | null;
}> {
  const local = listSavedProducts(profileId);
  const supabase = getSupabaseBrowserClient();
  const { data: favs, error } = await supabase
    .from("marketplace_favorites")
    .select("product_id")
    .eq("profile_id", profileId)
    .not("product_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) return { products: local, error: local.length ? null : error.message };
  const ids = (favs ?? []).map((f) => f.product_id as string).filter(Boolean);
  if (ids.length === 0) return { products: local, error: null };

  const catalog = await fetchMarketplaceProducts(200);
  const byId = new Map((catalog.data ?? []).map((p) => [p.id, p]));
  const live = ids.map((id) => byId.get(id)).filter((p): p is PublicProduct => Boolean(p));
  const seen = new Set(live.map((p) => p.id));
  return { products: [...local.filter((p) => !seen.has(p.id)), ...live], error: null };
}

export async function countFavoriteProducts(profileId: string): Promise<number> {
  const local = listSavedProducts(profileId).length;
  try {
    const supabase = getSupabaseBrowserClient();
    const { count } = await supabase
      .from("marketplace_favorites")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profileId)
      .not("product_id", "is", null);
    return Math.max(local, count ?? 0);
  } catch {
    return local;
  }
}

export type BusinessUpgradeRequest = {
  id: string;
  profile_id: string;
  business_name: string;
  location: string | null;
  phone: string | null;
  note: string | null;
  description: string | null;
  category_id: string | null;
  shop_image_url: string | null;
  whatsapp: string | null;
  state: string | null;
  city: string | null;
  street: string | null;
  latitude: number | null;
  longitude: number | null;
  public_location_label: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

export async function fetchMyBusinessUpgradeRequest(profileId: string): Promise<{
  request: BusinessUpgradeRequest | null;
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("business_upgrade_requests")
    .select("*")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { request: null, error: error.message };
  return { request: (data as BusinessUpgradeRequest | null) ?? null, error: null };
}

export async function uploadUpgradeShopImage(
  profileId: string,
  file: File,
): Promise<{ publicUrl: string | null; error: string | null }> {
  const packed = await prepareImageForUpload(file, { maxBytes: 5 * 1024 * 1024, maxEdge: 1280 });
  if (!packed.ok) return { publicUrl: null, error: packed.error };
  file = packed.file;
  const supabase = getSupabaseBrowserClient();
  const extRaw = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const ext = ["jpg", "jpeg", "png", "webp", "gif"].includes(extRaw)
    ? extRaw === "jpeg"
      ? "jpg"
      : extRaw
    : file.type === "image/webp"
      ? "webp"
      : file.type === "image/png"
        ? "png"
        : file.type === "image/gif"
          ? "gif"
          : "jpg";
  const path = `${profileId}/shop.${ext}`;
  const { error } = await supabase.storage.from("upgrade-shop-images").upload(path, file, {
    upsert: true,
    contentType: file.type || `image/${ext === "jpg" ? "jpeg" : ext}`,
  });
  if (error) {
    if (error.message.toLowerCase().includes("bucket not found")) {
      return {
        publicUrl: null,
        error: "Shop image storage is not set up yet. Apply migration 000015 in Supabase.",
      };
    }
    return { publicUrl: null, error: error.message };
  }
  const { data } = supabase.storage.from("upgrade-shop-images").getPublicUrl(path);
  return { publicUrl: data.publicUrl, error: null };
}

export async function requestBusinessUpgrade(input: {
  profileId: string;
  businessName: string;
  description: string;
  categoryId: string;
  location: string;
  street: string;
  city: string;
  state: string;
  phone: string;
  whatsapp?: string;
  shopImageUrl: string;
  latitude?: number | null;
  longitude?: number | null;
  publicLocationLabel?: string;
  note?: string;
}): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const phone = input.phone.trim();
  const { error } = await supabase.from("business_upgrade_requests").insert({
    profile_id: input.profileId,
    business_name: input.businessName.trim(),
    description: input.description.trim(),
    category_id: input.categoryId,
    location: input.location.trim(),
    street: input.street.trim(),
    city: input.city.trim(),
    state: input.state.trim(),
    phone,
    whatsapp: input.whatsapp?.trim() || null,
    shop_image_url: input.shopImageUrl,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    public_location_label: input.publicLocationLabel?.trim() || null,
    note: input.note?.trim() || null,
    status: "pending",
  });
  if (!error && phone) {
    await supabase.from("profiles").update({ phone }).eq("id", input.profileId).is("phone", null);
  }
  return { error: error?.message ?? null };
}

export async function setActiveMode(
  profileId: string,
  mode: "customer" | "business",
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("profiles").update({ active_mode: mode }).eq("id", profileId);
  return { error: error?.message ?? null };
}

export async function reportListing(input: {
  reporterId: string;
  businessId: string;
  reason: "spam" | "scam" | "hate" | "wrong_info" | "other";
  details?: string;
}): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("listing_reports").insert({
    reporter_id: input.reporterId,
    business_id: input.businessId,
    reason: input.reason,
    details: input.details?.trim() || null,
  });
  if (error?.code === "23505") return { error: "You already reported this shop." };
  return { error: error?.message ?? null };
}

export async function fetchMyEnquiries(profileId: string): Promise<{
  enquiries: Array<{
    id: string;
    business_id: string;
    message: string;
    created_at: string;
    customer_name: string;
  }>;
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("business_enquiries")
    .select("id, business_id, message, created_at, customer_name")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) return { enquiries: [], error: error.message };
  return { enquiries: data ?? [], error: null };
}

export async function fetchFollowedBusinesses(profileId: string): Promise<{
  shops: PublicBusiness[];
  error: string | null;
}> {
  const localShops = listFollowedShopsAsBusinesses(profileId);
  if (!profileId || profileId === "guest") return { shops: localShops, error: null };
  const supabase = getSupabaseBrowserClient();
  const { data: follows, error } = await supabase
    .from("business_follows")
    .select("business_id")
    .eq("profile_id", profileId);
  if (error) return { shops: localShops, error: localShops.length ? null : error.message };
  const ids = (follows ?? []).map((f) => f.business_id as string);
  if (ids.length === 0) return { shops: localShops, error: null };
  let { data, error: listError } = await supabase
    .from("public_marketplace_businesses")
    .select(MARKETPLACE_SHOP_SELECT)
    .in("id", ids);
  if (listError) {
    const core = await supabase.from("public_marketplace_businesses").select(MARKETPLACE_SHOP_SELECT_CORE).in("id", ids);
    if (core.error) {
      const listings = await supabase.from("public_business_listings").select(MARKETPLACE_SHOP_SELECT_CORE).in("id", ids);
      if (listings.error) {
        const legacy = await supabase
          .from("public_business_listings")
          .select(
            "id, slug, business_name, description, location_text, public_location_label, latitude, longitude, logo_url, category_id, category_name, public_phone, public_whatsapp, opening_hours, is_verified, verification_status",
          )
          .in("id", ids);
        if (legacy.error) return { shops: localShops, error: localShops.length ? null : legacy.error.message };
        data = legacy.data;
      } else {
        data = listings.data;
      }
    } else {
      data = core.data;
    }
    listError = null;
  }
  const live = (data ?? []) as PublicBusiness[];
  const seen = new Set(live.map((s) => s.id));
  return { shops: [...localShops.filter((s) => !seen.has(s.id)), ...live], error: null };
}

export async function fetchShopFollowers(
  businessId: string,
): Promise<{ people: ReturnType<typeof listShopFollowers>; error: string | null }> {
  const local = listShopFollowers(businessId);
  if (isMockFeedId(businessId)) return { people: [], error: null };
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("business_follows")
    .select("profile_id, created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return { people: local, error: local.length ? null : error.message };
  const ids = (data ?? []).map((r) => r.profile_id as string);
  if (ids.length === 0) return { people: local, error: null };
  const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", ids);
  const names = new Map((profiles ?? []).map((p) => [p.id as string, p.full_name as string]));
  const live = ids.map((id) => ({
    id,
    name: names.get(id) ?? "Shopper",
    handle: (names.get(id) ?? "shopper").replace(/[^a-zA-Z0-9]/g, "").toLowerCase(),
    kind: "person" as const,
  }));
  const seen = new Set(live.map((p) => p.id));
  return { people: [...live, ...local.filter((p) => !seen.has(p.id))], error: null };
}

export async function fetchNotificationPreferences(profileId: string): Promise<{
  prefs: NotificationPreferences;
  error: string | null;
}> {
  const fallback: NotificationPreferences = {
    profile_id: profileId,
    general: true,
    likes: true,
    comments: true,
    order_updates: true,
    enquiry_replies: true,
    followed_shops: true,
    marketing: true,
  };
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) return { prefs: fallback, error: error.message };
  // Coerce in case the category columns are not present yet (migration pending).
  const row = (data as Partial<NotificationPreferences> | null) ?? {};
  const pick = (key: keyof NotificationPreferences, dflt: boolean) =>
    typeof row[key] === "boolean" ? (row[key] as boolean) : dflt;
  return {
    prefs: {
      profile_id: profileId,
      general: pick("general", true),
      likes: pick("likes", true),
      comments: pick("comments", true),
      order_updates: pick("order_updates", true),
      enquiry_replies: pick("enquiry_replies", true),
      followed_shops: pick("followed_shops", true),
      marketing: pick("marketing", true),
    },
    error: null,
  };
}

export async function saveNotificationPreferences(
  prefs: NotificationPreferences,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("notification_preferences").upsert({
    ...prefs,
    updated_at: new Date().toISOString(),
  });
  return { error: error?.message ?? null };
}

function asPayoutAccount(row: Record<string, unknown>, businessId: string): import("@/types/database").BusinessPayoutAccount {
  return {
    business_id: (row.business_id as string | undefined) ?? (row.id as string | undefined) ?? businessId,
    business_name: (row.business_name as string) ?? "",
    payout_account_name: (row.payout_account_name as string | null) ?? null,
    payout_account_number: (row.payout_account_number as string | null) ?? null,
    payout_bank_name: (row.payout_bank_name as string | null) ?? null,
    payout_bank_code: (row.payout_bank_code as string | null) ?? null,
  };
}

export async function fetchBusinessPayoutAccount(businessId: string): Promise<{
  account: import("@/types/database").BusinessPayoutAccount | null;
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  const rpc = await supabase.rpc("get_business_payout_account", { p_business_id: businessId });
  const rpcRow = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
  if (!rpc.error && rpcRow) {
    return { account: asPayoutAccount(rpcRow as Record<string, unknown>, businessId), error: null };
  }
  const view = await supabase.from("public_business_payout_accounts").select("*").eq("business_id", businessId).maybeSingle();
  if (!view.error && view.data) {
    return { account: asPayoutAccount(view.data as Record<string, unknown>, businessId), error: null };
  }
  const fallback = await supabase
    .from("businesses")
    .select("id, business_name, payout_account_name, payout_account_number, payout_bank_name, payout_bank_code")
    .eq("id", businessId)
    .maybeSingle();
  if (fallback.data?.payout_account_number) {
    return { account: asPayoutAccount(fallback.data as Record<string, unknown>, businessId), error: null };
  }
  return { account: null, error: null };
}

export async function saveBusinessPayoutAccount(
  businessId: string,
  input: {
    payout_account_name: string;
    payout_account_number: string;
    payout_bank_name: string;
    payout_bank_code: string;
  },
  profileId?: string | null,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const name = input.payout_account_name.trim();
  const number = input.payout_account_number.replace(/\D/g, "");
  if (name.length < 2) return { error: "Enter the account name." };
  if (number.length < 8 || number.length > 12) return { error: "Enter a valid account number (8–12 digits)." };

  if (profileId) {
    await ensureOwnerMembership(businessId, profileId);
  } else {
    const { data: sessionData } = await supabase.auth.getUser();
    const authId = sessionData.user?.id;
    if (authId) {
      const profile = await supabase.from("profiles").select("id").eq("auth_id", authId).maybeSingle();
      if (profile.data?.id) await ensureOwnerMembership(businessId, profile.data.id as string);
    }
  }

  const rpc = await supabase.rpc("save_business_payout_account", {
    p_business_id: businessId,
    p_account_name: name,
    p_account_number: number,
    p_bank_name: input.payout_bank_name.trim(),
    p_bank_code: input.payout_bank_code.trim(),
  });
  if (!rpc.error) return { error: null };

  const { data, error } = await supabase
    .from("businesses")
    .update({
      payout_account_name: name,
      payout_account_number: number,
      payout_bank_name: input.payout_bank_name.trim(),
      payout_bank_code: input.payout_bank_code.trim(),
    })
    .eq("id", businessId)
    .select("id")
    .maybeSingle();
  if (!error && data?.id) return { error: null };

  const message = error?.message ?? rpc.error.message;
  if (/schema cache|column|payout_account/i.test(message)) {
    return { error: "Bank account is not set up on the database yet. Run migration 000033 in Supabase, then save again." };
  }
  if (/not allowed|row-level security|permission/i.test(message)) {
    return { error: "Could not save this shop’s bank account. Sign in as the shop owner and try again." };
  }
  return { error: message };
}

export async function fetchSellerWallet(businessId: string): Promise<{
  wallet: import("@/types/database").SellerWallet;
  requests: import("@/types/database").PayoutRequest[];
  credits: import("@/types/database").WalletCredit[];
  error: string | null;
}> {
  const empty = { business_id: businessId, available_ngn: 0, pending_ngn: 0 };
  const supabase = getSupabaseBrowserClient();
  const walletRes = await supabase.from("seller_wallets").select("*").eq("business_id", businessId).maybeSingle();
  const reqRes = await supabase
    .from("payout_requests")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(20);
  const creditRes = await supabase
    .from("wallet_credits")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(40);
  return {
    wallet: (walletRes.data as import("@/types/database").SellerWallet | null) ?? empty,
    requests: (reqRes.data ?? []) as import("@/types/database").PayoutRequest[],
    credits: (creditRes.data ?? []) as import("@/types/database").WalletCredit[],
    error: walletRes.error?.message ?? reqRes.error?.message ?? creditRes.error?.message ?? null,
  };
}

export async function startFlutterwavePay(orderId: string): Promise<{ link: string | null; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return { link: null, error: "Sign in to pay online." };
  const res = await fetch("/api/payments/flutterwave", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ orderId }),
  });
  const json = (await res.json()) as { link?: string; error?: string };
  if (!res.ok) return { link: null, error: json.error ?? "Could not open Flutterwave." };
  return { link: json.link ?? null, error: json.link ? null : "Could not open Flutterwave." };
}

export async function provisionVirtualAccount(
  businessId: string,
  extra?: { bvn?: string; idType?: "bvn" | "nin"; idNumber?: string },
): Promise<{
  account: {
    accountName: string;
    accountNumber: string;
    bankName: string;
    bankCode: string | null;
  } | null;
  accounts: Array<{ accountName: string; accountNumber: string; bankName: string }>;
  wallet: { available_ngn: number; pending_ngn: number };
  needsBvn?: boolean;
  error: string | null;
}> {
  const emptyWallet = { available_ngn: 0, pending_ngn: 0 };
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { account: null, accounts: [], wallet: emptyWallet, error: "Sign in first." };
  }
  const res = await fetch("/api/payments/virtual-account", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      businessId,
      idType: extra?.idType ?? "bvn",
      idNumber: extra?.idNumber || extra?.bvn,
    }),
  });
  const json = (await res.json()) as {
    account?: { accountName: string; accountNumber: string; bankName: string; bankCode: string | null };
    accounts?: Array<{ accountName: string; accountNumber: string; bankName: string }>;
    error?: string;
    needsBvn?: boolean;
  };
  if (!res.ok) {
    return {
      account: null,
      accounts: [],
      wallet: emptyWallet,
      needsBvn: json.needsBvn,
      error: json.error ?? "Could not create shop account.",
    };
  }
  return { account: json.account ?? null, accounts: json.accounts ?? [], wallet: emptyWallet, error: null };
}

export async function fetchVirtualAccountWallet(businessId: string): Promise<{
  configured: boolean;
  account: {
    accountName: string;
    accountNumber: string;
    bankName: string;
    bankCode: string | null;
  } | null;
  accounts: Array<{ accountName: string; accountNumber: string; bankName: string }>;
  wallet: { available_ngn: number; pending_ngn: number };
  credits: import("@/types/database").WalletCredit[];
  activity: Array<{
    amount: number;
    reference: string;
    accountNumber: string | null;
    createdAt: string | null;
    direction: "in" | "out";
    description: string;
  }>;
  payout: {
    accountName: string | null;
    accountNumber: string | null;
    bankName: string | null;
    bankCode: string | null;
  } | null;
  hasTransferPin: boolean;
  error: string | null;
}> {
  const emptyWallet = { available_ngn: 0, pending_ngn: 0 };
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return {
      configured: false,
      account: null,
      accounts: [],
      wallet: emptyWallet,
      credits: [],
      activity: [],
      payout: null,
      hasTransferPin: false,
      error: "Sign in first.",
    };
  }
  const res = await fetch(`/api/payments/virtual-account?businessId=${encodeURIComponent(businessId)}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const json = (await res.json()) as {
    configured?: boolean;
    account?: {
      accountName: string;
      accountNumber: string;
      bankName: string;
      bankCode: string | null;
    } | null;
    accounts?: Array<{ accountName: string; accountNumber: string; bankName: string }>;
    wallet?: { available_ngn: number; pending_ngn: number };
    credits?: import("@/types/database").WalletCredit[];
    activity?: Array<{
      amount: number;
      reference: string;
      accountNumber: string | null;
      createdAt: string | null;
      direction: "in" | "out";
      description: string;
    }>;
    payout?: {
      accountName: string | null;
      accountNumber: string | null;
      bankName: string | null;
      bankCode: string | null;
    } | null;
    hasTransferPin?: boolean;
    error?: string;
  };
  if (!res.ok) {
    return {
      configured: false,
      account: null,
      accounts: [],
      wallet: emptyWallet,
      credits: [],
      activity: [],
      payout: null,
      hasTransferPin: false,
      error: json.error ?? "Could not load wallet.",
    };
  }
  return {
    configured: Boolean(json.configured),
    account: json.account ?? null,
    accounts: json.accounts ?? (json.account ? [json.account] : []),
    wallet: json.wallet ?? emptyWallet,
    credits: json.credits ?? [],
    activity: json.activity ?? [],
    payout: json.payout ?? null,
    hasTransferPin: Boolean(json.hasTransferPin),
    error: null,
  };
}

export async function saveSellerTransferPin(
  businessId: string,
  input: { pin: string; confirmPin: string; currentPin?: string },
): Promise<{ error: string | null; message?: string }> {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return { error: "Sign in first." };
  const res = await fetch("/api/payments/payout", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ businessId, ...input }),
  });
  let json: { error?: string; message?: string } = {};
  try {
    json = (await res.json()) as { error?: string; message?: string };
  } catch {
    json = { error: res.ok ? undefined : "Could not save the PIN." };
  }
  if (!res.ok) return { error: json.error ?? "Could not save the PIN." };
  return { error: null, message: json.message ?? "Transfer PIN saved." };
}

export async function requestSellerPayout(
  businessId: string,
  amount: number,
  destination?: {
    accountNumber: string;
    accountName: string;
    bankCode: string;
    bankName: string;
    pin: string;
  },
): Promise<{ error: string | null; message?: string }> {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return { error: "Sign in first." };
  const res = await fetch("/api/payments/payout", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ businessId, amount, ...destination }),
  });
  let json: { error?: string; message?: string } = {};
  try {
    json = (await res.json()) as { error?: string; message?: string };
  } catch {
    json = { error: res.ok ? undefined : "Withdrawal did not complete. Try again." };
  }
  if (!res.ok) return { error: json.error ?? "Payout failed." };
  return { error: null, message: json.message ?? "Transfer sent." };
}
