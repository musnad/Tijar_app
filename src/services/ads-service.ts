import { takeSponsoredAdForBusiness } from "@/lib/ads/attribution";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { packageForHours, type AdObjective, type AdSourceKind } from "@/lib/ads/packages";
import { uploadProductImage } from "@/services/product-image-service";

export type SponsoredAd = {
  id: string;
  business_id: string;
  profile_id: string;
  created_by_admin: boolean;
  source_kind: AdSourceKind;
  video_post_id: string | null;
  product_id: string | null;
  flyer_url: string | null;
  caption: string | null;
  destination_url: string | null;
  objective: AdObjective;
  duration_hours: number;
  amount_ngn: number;
  status: "pending_payment" | "live" | "paused" | "ended" | "cancelled" | "draft" | string;
  starts_at: string | null;
  ends_at: string | null;
  paid_at: string | null;
  remaining_seconds?: number | null;
  views_count: number;
  unique_viewers: number;
  likes_count: number;
  follows_count: number;
  calls_count: number;
  clicks_count: number;
  buys_count: number;
  profile_views_count: number;
  created_at: string;
  shop_name?: string;
};

export type LiveAdCard = SponsoredAd & {
  shop_logo: string | null;
  shop_slug: string | null;
  shop_phone: string | null;
  shop_verified: boolean;
  location_label: string | null;
};

async function authHeader(): Promise<string | null> {
  const {
    data: { session },
  } = await getSupabaseBrowserClient().auth.getSession();
  return session?.access_token ? `Bearer ${session.access_token}` : null;
}

function mapAd(row: Record<string, unknown>): SponsoredAd {
  return {
    id: String(row.id),
    business_id: String(row.business_id),
    profile_id: String(row.profile_id),
    created_by_admin: Boolean(row.created_by_admin),
    source_kind: (row.source_kind as AdSourceKind) ?? "flyer",
    video_post_id: (row.video_post_id as string | null) ?? null,
    product_id: (row.product_id as string | null) ?? null,
    flyer_url: (row.flyer_url as string | null) ?? null,
    caption: (row.caption as string | null) ?? null,
    destination_url: (row.destination_url as string | null) ?? null,
    objective: (row.objective as AdObjective) ?? "views",
    duration_hours: Number(row.duration_hours ?? 24),
    amount_ngn: Number(row.amount_ngn ?? 0),
    status: String(row.status ?? "pending_payment"),
    starts_at: (row.starts_at as string | null) ?? null,
    ends_at: (row.ends_at as string | null) ?? null,
    paid_at: (row.paid_at as string | null) ?? null,
    remaining_seconds: row.remaining_seconds == null ? null : Number(row.remaining_seconds),
    views_count: Number(row.views_count ?? 0),
    unique_viewers: Number(row.unique_viewers ?? 0),
    likes_count: Number(row.likes_count ?? 0),
    follows_count: Number(row.follows_count ?? 0),
    calls_count: Number(row.calls_count ?? 0),
    clicks_count: Number(row.clicks_count ?? 0),
    buys_count: Number(row.buys_count ?? 0),
    profile_views_count: Number(row.profile_views_count ?? 0),
    created_at: String(row.created_at ?? ""),
    shop_name: (row.shop_name as string | undefined) ?? undefined,
  };
}

export async function fetchMyAds(businessId: string): Promise<{ ads: SponsoredAd[]; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  await supabase.rpc("expire_sponsored_ads");
  const { data, error } = await supabase
    .from("sponsored_ads")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) return { ads: [], error: error.message };
  return { ads: (data ?? []).map((row) => mapAd(row as Record<string, unknown>)), error: null };
}

export async function fetchAllAdsAdmin(): Promise<{ ads: SponsoredAd[]; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  await supabase.rpc("expire_sponsored_ads");
  const { data, error } = await supabase.from("sponsored_ads").select("*").order("created_at", { ascending: false }).limit(200);
  if (error) return { ads: [], error: error.message };
  const ads = (data ?? []).map((row) => mapAd(row as Record<string, unknown>));
  const ids = [...new Set(ads.map((a) => a.business_id))];
  if (ids.length) {
    const shops = await supabase.from("businesses").select("id, business_name").in("id", ids);
    const names = new Map((shops.data ?? []).map((s) => [String(s.id), String(s.business_name ?? "")]));
    for (const ad of ads) ad.shop_name = names.get(ad.business_id) || ad.shop_name;
  }
  return { ads, error: null };
}

export async function fetchLiveAds(): Promise<{ ads: LiveAdCard[]; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  await supabase.rpc("expire_sponsored_ads");
  const { data, error } = await supabase
    .from("sponsored_ads")
    .select("*")
    .eq("status", "live")
    .gt("ends_at", new Date().toISOString())
    .order("starts_at", { ascending: false })
    .limit(24);
  if (error) return { ads: [], error: error.message };
  const ads = (data ?? []).map((row) => mapAd(row as Record<string, unknown>));
  const ids = [...new Set(ads.map((a) => a.business_id))];
  const shops = ids.length
    ? await supabase
        .from("businesses")
        .select("id, business_name, logo_url, public_slug, public_phone, is_verified, public_location_label, location")
        .in("id", ids)
    : { data: [] };
  const byId = new Map((shops.data ?? []).map((s) => [String(s.id), s]));
  return {
    ads: ads.map((ad) => {
      const shop = byId.get(ad.business_id);
      return {
        ...ad,
        shop_name: String(shop?.business_name ?? ad.shop_name ?? "Shop"),
        shop_logo: (shop?.logo_url as string | null) ?? null,
        shop_slug: (shop?.public_slug as string | null) ?? null,
        shop_phone: (shop?.public_phone as string | null) ?? null,
        shop_verified: Boolean(shop?.is_verified),
        location_label: ((shop?.public_location_label as string | null) || (shop?.location as string | null)) ?? null,
      };
    }),
    error: null,
  };
}

export async function createSponsoredAd(input: {
  businessId: string;
  profileId: string;
  sourceKind: AdSourceKind;
  objective: AdObjective;
  durationHours: number;
  caption: string;
  destinationUrl: string;
  videoPostId?: string | null;
  productId?: string | null;
  flyer?: File | null;
  createdByAdmin?: boolean;
  asDraft?: boolean;
}): Promise<{ ad: SponsoredAd | null; error: string | null }> {
  const pack = packageForHours(input.durationHours);
  if (!pack) return { ad: null, error: "Pick a campaign length starting from 24 hours." };
  if (!input.caption.trim()) return { ad: null, error: "Write a short caption for the ad." };
  if (!input.asDraft) {
    if (input.sourceKind === "flyer" && !input.flyer) return { ad: null, error: "Upload a flyer photo." };
    if (input.sourceKind === "post" && !input.videoPostId) return { ad: null, error: "Pick a post to promote." };
    if (input.sourceKind === "product" && !input.productId) return { ad: null, error: "Pick a product to promote." };
  }

  let flyerUrl: string | null = null;
  if (input.flyer) {
    const uploaded = await uploadProductImage(input.businessId, `ad-${crypto.randomUUID()}`, input.flyer, 0);
    if (uploaded.error || !uploaded.publicUrl) return { ad: null, error: uploaded.error ?? "Could not upload the flyer." };
    flyerUrl = uploaded.publicUrl;
  }

  const dest = input.destinationUrl.trim();
  const destination =
    dest && !/^https?:\/\//i.test(dest) ? `https://${dest}` : dest || null;

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("sponsored_ads")
    .insert({
      business_id: input.businessId,
      profile_id: input.profileId,
      created_by_admin: Boolean(input.createdByAdmin),
      source_kind: input.sourceKind,
      video_post_id: input.videoPostId ?? null,
      product_id: input.productId ?? null,
      flyer_url: flyerUrl,
      caption: input.caption.trim().slice(0, 280),
      destination_url: destination,
      objective: input.objective,
      duration_hours: pack.hours,
      amount_ngn: input.createdByAdmin ? 0 : pack.amount,
      status: input.asDraft ? "draft" : "pending_payment",
    })
    .select("*")
    .single();
  if (error || !data) return { ad: null, error: error?.message ?? "Could not create the ad." };
  return { ad: mapAd(data as Record<string, unknown>), error: null };
}

export async function fetchAdsPayAccount(): Promise<{
  account: { accountNumber: string; accountName: string; bankName: string } | null;
  error: string | null;
}> {
  const auth = await authHeader();
  if (!auth) return { account: null, error: "Sign in first." };
  const res = await fetch("/api/ads/account", { headers: { Authorization: auth }, cache: "no-store" });
  const json = (await res.json()) as { account?: { accountNumber: string; accountName: string; bankName: string }; error?: string };
  if (!res.ok) return { account: null, error: json.error ?? "Could not load the TIJAR ads account." };
  return { account: json.account ?? null, error: null };
}

export async function controlSponsoredAd(
  adId: string,
  action: "pause" | "resume" | "stop" | "delete",
): Promise<{ error: string | null; status?: string }> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("control_sponsored_ad", { p_ad_id: adId, p_action: action });
  if (error) return { error: error.message };
  const row = (data ?? {}) as { error?: string; ok?: boolean; status?: string };
  if (row.error) return { error: row.error };
  return { error: null, status: row.status };
}

export async function markAdReadyToPay(adId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from("sponsored_ads")
    .update({ status: "pending_payment", updated_at: new Date().toISOString() })
    .eq("id", adId);
  return { error: error?.message ?? null };
}

export async function confirmAdPayment(
  adId: string,
  watchedFrom?: string,
): Promise<{ paid: boolean; error: string | null }> {
  const auth = await authHeader();
  if (!auth) return { paid: false, error: "Sign in first." };
  const res = await fetch("/api/ads/confirm", {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ adId, watchedFrom }),
  });
  const json = (await res.json()) as { paid?: boolean; error?: string };
  if (!res.ok) return { paid: false, error: json.error ?? "Could not confirm payment." };
  return { paid: Boolean(json.paid), error: json.error ?? null };
}

export async function publishAdAsAdmin(adId: string): Promise<{ error: string | null }> {
  const auth = await authHeader();
  if (!auth) return { error: "Sign in first." };
  const res = await fetch("/api/ads/go-live", {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ adId }),
  });
  const json = (await res.json()) as { error?: string };
  if (!res.ok) return { error: json.error ?? "Could not publish the ad." };
  return { error: json.error ?? null };
}

export type AdsTicketStatus = "open" | "attended" | "resolved" | "closed";

export type SponsoredAdTicket = {
  id: string;
  ad_id: string;
  business_id: string;
  profile_id: string;
  full_name: string;
  phone: string;
  message: string;
  amount_ngn: number;
  status: AdsTicketStatus;
  admin_note: string | null;
  created_at: string;
  shop_name?: string;
  ad_caption?: string;
};

function mapTicket(row: Record<string, unknown>): SponsoredAdTicket {
  return {
    id: String(row.id),
    ad_id: String(row.ad_id),
    business_id: String(row.business_id),
    profile_id: String(row.profile_id),
    full_name: String(row.full_name ?? ""),
    phone: String(row.phone ?? ""),
    message: String(row.message ?? ""),
    amount_ngn: Number(row.amount_ngn ?? 0),
    status: (row.status as AdsTicketStatus) ?? "open",
    admin_note: (row.admin_note as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    shop_name: (row.shop_name as string | undefined) ?? undefined,
    ad_caption: (row.ad_caption as string | undefined) ?? undefined,
  };
}

export async function submitAdSupportTicket(input: {
  ad: SponsoredAd;
  profileId: string;
  fullName: string;
  phone: string;
  message: string;
}): Promise<{ ticket: SponsoredAdTicket | null; error: string | null }> {
  const name = input.fullName.trim();
  const phone = input.phone.trim();
  const message = input.message.trim();
  if (!name) return { ticket: null, error: "Write your name." };
  if (phone.replace(/\D/g, "").length < 10) return { ticket: null, error: "Write a valid phone number." };
  if (message.length < 8) return { ticket: null, error: "Write what happened so we can treat it." };
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("sponsored_ad_tickets")
    .insert({
      ad_id: input.ad.id,
      business_id: input.ad.business_id,
      profile_id: input.profileId,
      full_name: name.slice(0, 80),
      phone: phone.slice(0, 24),
      message: message.slice(0, 1000),
      amount_ngn: input.ad.amount_ngn,
      status: "open",
    })
    .select("*")
    .single();
  if (error || !data) return { ticket: null, error: error?.message ?? "Could not send your complaint." };
  return { ticket: mapTicket(data as Record<string, unknown>), error: null };
}

export async function fetchAdSupportTickets(): Promise<{ tickets: SponsoredAdTicket[]; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("sponsored_ad_tickets")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return { tickets: [], error: error.message };
  const tickets = (data ?? []).map((row) => mapTicket(row as Record<string, unknown>));
  const shopIds = [...new Set(tickets.map((t) => t.business_id))];
  const adIds = [...new Set(tickets.map((t) => t.ad_id))];
  if (shopIds.length) {
    const shops = await supabase.from("businesses").select("id, business_name").in("id", shopIds);
    const names = new Map((shops.data ?? []).map((s) => [String(s.id), String(s.business_name ?? "")]));
    for (const ticket of tickets) ticket.shop_name = names.get(ticket.business_id) || ticket.shop_name;
  }
  if (adIds.length) {
    const ads = await supabase.from("sponsored_ads").select("id, caption").in("id", adIds);
    const caps = new Map((ads.data ?? []).map((a) => [String(a.id), String(a.caption ?? "")]));
    for (const ticket of tickets) ticket.ad_caption = caps.get(ticket.ad_id) || ticket.ad_caption;
  }
  return { tickets, error: null };
}

export async function updateAdSupportTicket(
  ticketId: string,
  status: AdsTicketStatus,
  adminNote?: string,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (adminNote !== undefined) patch.admin_note = adminNote;
  const { error } = await supabase.from("sponsored_ad_tickets").update(patch).eq("id", ticketId);
  return { error: error?.message ?? null };
}

export async function trackAdEvent(
  adId: string,
  kind: "impression" | "view" | "like" | "follow" | "call" | "click" | "buy" | "profile_view",
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  await supabase.rpc("record_sponsored_ad_event", { p_ad_id: adId, p_kind: kind });
}

export async function recordAdBuyForBusiness(businessId: string): Promise<void> {
  const adId = takeSponsoredAdForBusiness(businessId);
  if (adId) await trackAdEvent(adId, "buy");
}

function markPaidAd<T extends { id: string }>(row: T, ad: LiveAdCard): T {
  return {
    ...row,
    sponsored_ad_id: ad.id,
    ad_objective: ad.objective,
    destination_url: ad.destination_url,
    shop_phone: ad.shop_phone,
    is_paid_ad: true,
  } as T;
}

export function interleaveLiveAds<T extends { id: string; sponsored_ad_id?: string | null }>(
  videos: T[],
  ads: LiveAdCard[],
  toVideo: (ad: LiveAdCard) => T,
): T[] {
  if (ads.length === 0) return videos;
  const used = new Set<string>();
  const out: T[] = [];
  let ai = 0;
  for (let i = 0; i < videos.length; i += 1) {
    if (i > 0 && i % 4 === 0 && ai < ads.length) {
      const ad = ads[ai]!;
      ai += 1;
      const existing = videos.find((v) => v.id === ad.video_post_id);
      if (existing && !used.has(existing.id)) {
        used.add(existing.id);
        out.push(markPaidAd(existing, ad));
      } else {
        out.push(toVideo(ad));
      }
    }
    const row = videos[i]!;
    if (used.has(row.id)) continue;
    const match = ads.find((a) => a.video_post_id === row.id);
    out.push(match ? markPaidAd(row, match) : row);
  }
  while (ai < ads.length) {
    const ad = ads[ai]!;
    ai += 1;
    if (ad.video_post_id && videos.some((v) => v.id === ad.video_post_id)) continue;
    out.push(toVideo(ad));
  }
  return out;
}
