import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { displayShopName, shopLinkSlug } from "@/lib/shop-names";

export type BusinessOfTheWeek = {
  id: string;
  businessId: string;
  businessName: string;
  slug: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  promoText: string | null;
  locationLabel: string | null;
  startsAt: string;
  endsAt: string;
  isVerified: boolean;
};

export type AdminBusinessOfTheWeek = BusinessOfTheWeek & {
  createdAt: string;
};

function missing(message: string | undefined): boolean {
  return Boolean(message && /schema cache|does not exist|could not find/i.test(message));
}

function asPublic(row: Record<string, unknown>): BusinessOfTheWeek {
  const businessId = String(row.business_id ?? "");
  return {
    id: String(row.id ?? ""),
    businessId,
    businessName: displayShopName((row.business_name as string | null) ?? null),
    slug: shopLinkSlug((row.slug as string | null) ?? null, businessId),
    logoUrl: (row.logo_url as string | null) ?? null,
    bannerUrl: (row.banner_url as string | null) ?? null,
    promoText: (row.promo_text as string | null) ?? null,
    locationLabel: (row.public_location_label as string | null) ?? (row.location_text as string | null) ?? null,
    startsAt: String(row.starts_at ?? ""),
    endsAt: String(row.ends_at ?? ""),
    isVerified: Boolean(row.is_verified),
  };
}

export function isPromotionLive(row: { startsAt: string; endsAt: string }, now = Date.now()): boolean {
  const start = new Date(row.startsAt).getTime();
  const end = new Date(row.endsAt).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && now >= start && now < end;
}

export async function fetchActiveBusinessOfTheWeek(): Promise<{
  featured: BusinessOfTheWeek | null;
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  const now = new Date().toISOString();
  const view = await supabase
    .from("public_business_of_the_week")
    .select("*")
    .gt("ends_at", now)
    .lte("starts_at", now)
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!view.error) {
    if (!view.data) return { featured: null, error: null };
    const featured = asPublic(view.data as Record<string, unknown>);
    return { featured: isPromotionLive(featured) ? featured : null, error: null };
  }
  if (!missing(view.error.message)) return { featured: null, error: view.error.message };

  const live = await supabase
    .from("business_of_the_week")
    .select("id, business_id, promo_text, banner_url, starts_at, ends_at")
    .lte("starts_at", now)
    .gt("ends_at", now)
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (live.error) {
    return { featured: null, error: missing(live.error.message) ? null : live.error.message };
  }
  if (!live.data) return { featured: null, error: null };
  const shop = await supabase
    .from("public_marketplace_businesses")
    .select("id, slug, business_name, logo_url, is_verified, public_location_label, location_text")
    .eq("id", live.data.business_id as string)
    .maybeSingle();
  return {
    featured: asPublic({
      ...(live.data as Record<string, unknown>),
      ...(shop.data ?? {}),
      business_id: live.data.business_id,
      slug: (shop.data as { slug?: string } | null)?.slug,
    }),
    error: null,
  };
}

export async function fetchAdminBusinessOfTheWeek(): Promise<{
  promotions: AdminBusinessOfTheWeek[];
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("business_of_the_week")
    .select("id, business_id, promo_text, banner_url, starts_at, ends_at, created_at")
    .order("starts_at", { ascending: false })
    .limit(40);
  if (error) return { promotions: [], error: missing(error.message) ? null : error.message };

  const ids = [...new Set((data ?? []).map((r) => r.business_id as string))];
  const shops = ids.length
    ? await supabase
        .from("businesses")
        .select("id, business_name, public_slug, logo_url, public_location_label, location, verified_badge")
        .in("id", ids)
    : { data: [] as Array<Record<string, unknown>> };
  const byId = new Map(((shops.data ?? []) as Array<Record<string, unknown>>).map((s) => [s.id as string, s]));

  const promotions = (data ?? []).map((row) => {
    const shop = byId.get(row.business_id as string);
    return {
      ...asPublic({
        ...row,
        business_name: shop?.business_name,
        slug: shop?.public_slug,
        logo_url: shop?.logo_url,
        public_location_label: shop?.public_location_label,
        location_text: shop?.location,
        is_verified: shop?.verified_badge,
      }),
      createdAt: String(row.created_at ?? ""),
    };
  });
  return { promotions, error: null };
}

export async function saveBusinessOfTheWeek(input: {
  id?: string | null;
  businessId: string;
  startsAt: string;
  endsAt: string;
  promoText?: string | null;
  bannerUrl?: string | null;
}): Promise<{ id: string | null; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("save_business_of_the_week", {
    p_business_id: input.businessId,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_promo_text: input.promoText?.trim() || null,
    p_banner_url: input.bannerUrl?.trim() || null,
    p_id: input.id ?? null,
  });
  if (error) return { id: null, error: error.message };
  return { id: (data as string | null) ?? null, error: null };
}

export async function endBusinessOfTheWeek(id: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("end_business_of_the_week", { p_id: id });
  return { error: error?.message ?? null };
}

export async function uploadBusinessOfTheWeekBanner(
  file: File,
): Promise<{ publicUrl: string | null; error: string | null }> {
  if (!file.type.startsWith("image/")) return { publicUrl: null, error: "Use a JPG, PNG, or WEBP image." };
  if (file.size > 5 * 1024 * 1024) return { publicUrl: null, error: "Image must be under 5 MB." };
  const supabase = getSupabaseBrowserClient();
  const ext = file.type.includes("png") ? "png" : file.type.includes("webp") ? "webp" : "jpg";
  const path = `botw/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("business-logos").upload(path, file, {
    upsert: true,
    contentType: file.type,
  });
  if (error) return { publicUrl: null, error: error.message };
  return { publicUrl: supabase.storage.from("business-logos").getPublicUrl(path).data.publicUrl, error: null };
}
