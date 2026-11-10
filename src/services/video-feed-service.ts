import { isMockFeedId } from "@/features/marketplace/feed-mock";
import {
  NEARBY_RADIUS_KM,
  rankVideoFeed,
  shopDistanceKm,
  type ViewerSignals,
  type VideoAttribution,
} from "@/lib/feed/rank-video-feed";
import {
  isFollowingShop,
  listFollowedShopIds,
  loadUserSocial,
  toggleFollowShopLocal,
} from "@/lib/shop-social";
import { displayShopName, isBlankShopName, lookupProfileNames, lookupProfilePhotos, lookupShopProfiles } from "@/lib/shop-names";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { submitStudioVideo } from "@/services/video-studio-service";
import type { PublicProduct } from "@/types/database";

export type PublicFeedVideo = {
  id: string;
  business_id: string;
  profile_id: string;
  caption: string | null;
  captions_url: string | null;
  cover_path: string | null;
  playback_url: string | null;
  storage_path: string;
  duration_ms: number | null;
  attribution: VideoAttribution;
  like_count: number;
  comment_count: number;
  save_count: number;
  view_count: number;
  share_count?: number;
  image_urls?: string[];
  published_at: string | null;
  created_at: string;
  slug: string;
  business_name: string;
  business_logo_url: string | null;
  is_verified: boolean;
  verification_status: string;
  category_id: string | null;
  category_name: string | null;
  location_text: string | null;
  public_location_label: string | null;
  latitude?: number | null;
  longitude?: number | null;
  distance_km?: number | null;
  product_ids: string[];
  media_kind?: "video" | "image" | string | null;
  /** Standalone display price for a photo/video post. */
  price?: number | null;
  post_type?: "standard" | "bid" | string | null;
  bid_starting_price?: number | null;
  bid_starts_at?: string | null;
  bid_ends_at?: string | null;
  bid_sale_limit?: number | null;
  bid_status?: "open" | "sold" | "paid" | string | null;
  bid_winner_id?: string | null;
  bid_winner_name?: string | null;
  bid_sold_at?: string | null;
  bid_payment_due_at?: string | null;
  bid_paid_at?: string | null;
  /** Set when the winning bidder says they have paid (bank transfer). */
  bid_buyer_marked_paid_at?: string | null;
  /** Highest bid so far (from the feed view). */
  top_bid?: number | null;
  bid_count?: number | null;
};

export function isBidPost(video: { post_type?: string | null }): boolean {
  return video.post_type === "bid";
}

export function isImagePost(row: {
  media_kind?: string | null;
  storage_path?: string | null;
  playback_url?: string | null;
  cover_path?: string | null;
}): boolean {
  if (row.media_kind === "video") return false;
  if (row.media_kind === "image") return true;
  const main = `${row.storage_path ?? ""} ${row.playback_url ?? ""}`.toLowerCase();
  return /\.(jpe?g|png|webp|gif)(\?|$)/.test(main);
}

export type VideoComment = {
  id: string;
  video_post_id: string;
  profile_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  author_name?: string;
};

function publicPlaybackUrl(storagePath: string, playbackUrl: string | null): string {
  if (playbackUrl) return playbackUrl;
  const supabase = getSupabaseBrowserClient();
  return supabase.storage.from("business-videos").getPublicUrl(storagePath).data.publicUrl;
}

export function resolveVideoSrc(row: PublicFeedVideo): string {
  const path = row.playback_url || row.storage_path;
  if (path.startsWith("http") || path.startsWith("/")) return path;
  return publicPlaybackUrl(row.storage_path, row.playback_url);
}

export function resolveCoverSrc(coverPath: string | null): string | null {
  if (!coverPath) return null;
  if (coverPath.startsWith("http") || coverPath.startsWith("/")) return coverPath;
  const supabase = getSupabaseBrowserClient();
  return supabase.storage.from("business-videos").getPublicUrl(coverPath).data.publicUrl;
}

export function asUrlList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function addGalleryUrl(out: string[], seen: Set<string>, raw: string | null | undefined) {
  if (!raw) return;
  const url = raw.startsWith("http") || raw.startsWith("/") ? raw : resolveCoverSrc(raw);
  if (!url || seen.has(url)) return;
  seen.add(url);
  out.push(url);
}

export function resolvePostGallery(video: PublicFeedVideo, products: PublicProduct[] = []): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of asUrlList(video.image_urls)) addGalleryUrl(out, seen, url);
  if (isImagePost(video)) {
    addGalleryUrl(out, seen, video.cover_path);
    addGalleryUrl(out, seen, video.playback_url);
    addGalleryUrl(out, seen, video.storage_path);
  }
  for (const product of products) {
    addGalleryUrl(out, seen, product.image_url);
    for (const extra of product.extra_image_urls ?? []) addGalleryUrl(out, seen, extra);
  }
  return out;
}

export function productGallery(product: PublicProduct): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  addGalleryUrl(out, seen, product.image_url);
  for (const extra of product.extra_image_urls ?? []) addGalleryUrl(out, seen, extra);
  return out;
}

export const FEED_PAGE_SIZE = 8;

export async function fetchPublicVideoFeed(opts?: {
  limit?: number;
  before?: string | null;
  offset?: number;
}): Promise<{
  videos: PublicFeedVideo[];
  error: string | null;
}> {
  const limit = opts?.limit ?? FEED_PAGE_SIZE;
  const before = opts?.before ?? null;
  const offset = !before && opts?.offset && opts.offset > 0 ? opts.offset : 0;
  const supabase = getSupabaseBrowserClient();
  let query = supabase
    .from("public_video_feed")
    .select("*")
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (before) query = query.lt("published_at", before).limit(limit);
  else if (offset > 0) query = query.range(offset, offset + limit - 1);
  else query = query.limit(limit);
  const fromView = await query;
  if (!fromView.error && (fromView.data?.length ?? 0) > 0) {
    return { videos: await attachShopNames((fromView.data ?? []) as PublicFeedVideo[]), error: null };
  }
  if (fromView.error && !/schema cache|column|media_kind|does not exist/i.test(fromView.error.message)) {
    const fallback = await loadFeedFromPosts(undefined, limit, before, offset);
    if (fallback.videos.length > 0) return fallback;
    return { videos: [], error: fromView.error.message };
  }
  const fallback = await loadFeedFromPosts(undefined, limit, before, offset);
  if (fallback.videos.length > 0) return fallback;
  return { videos: await attachShopNames((fromView.data ?? []) as PublicFeedVideo[]), error: null };
}

export async function fetchPostsForBusiness(businessId: string): Promise<PublicFeedVideo[]> {
  if (!businessId) return [];
  const supabase = getSupabaseBrowserClient();
  const fromView = await supabase
    .from("public_video_feed")
    .select("*")
    .eq("business_id", businessId)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(80);
  if (!fromView.error && (fromView.data?.length ?? 0) > 0) {
    return attachShopNames((fromView.data ?? []) as PublicFeedVideo[]);
  }
  const fallback = await loadFeedFromPosts(businessId);
  return fallback.videos;
}

async function loadFeedFromPosts(
  businessId?: string,
  limit = 80,
  before?: string | null,
  offset = 0,
): Promise<{ videos: PublicFeedVideo[]; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  let query = supabase
    .from("video_posts")
    .select(
      "id, business_id, profile_id, caption, captions_url, cover_path, playback_url, storage_path, duration_ms, attribution, like_count, comment_count, save_count, view_count, share_count, image_urls, published_at, created_at, media_kind",
    )
    .eq("status", "ready")
    .order("created_at", { ascending: false });
  if (before) query = query.lt("created_at", before).limit(limit);
  else if (offset > 0) query = query.range(offset, offset + limit - 1);
  else query = query.limit(limit);
  if (businessId) query = query.eq("business_id", businessId);
  const posts = await query;
  let rows = posts.data;
  let selectError = posts.error;
  if (selectError && /share_count|image_urls|media_kind/i.test(selectError.message)) {
    const slim =
      "id, business_id, profile_id, caption, captions_url, cover_path, playback_url, storage_path, duration_ms, attribution, like_count, comment_count, save_count, view_count, published_at, created_at" +
      (/media_kind/i.test(selectError.message) ? "" : ", media_kind");
    let retryQuery = supabase.from("video_posts").select(slim).eq("status", "ready").order("created_at", { ascending: false }).limit(limit);
    if (before) retryQuery = retryQuery.lt("created_at", before);
    if (businessId) retryQuery = retryQuery.eq("business_id", businessId);
    const retry = await retryQuery;
    if (retry.error) return { videos: [], error: retry.error.message };
    rows = retry.data;
    selectError = null;
  } else if (selectError) {
    return { videos: [], error: selectError.message };
  }

  const list = rows ?? [];
  if (list.length === 0) return { videos: [], error: null };

  const businessIds = [...new Set(list.map((r) => r.business_id as string))];
  const postIds = list.map((r) => r.id as string);
  const [shops, tags] = await Promise.all([
    supabase.from("public_marketplace_businesses").select("id, slug, business_name, logo_url, is_verified, verification_status, category_id, category_name, location_text, public_location_label, latitude, longitude").in("id", businessIds),
    supabase.from("video_post_products").select("video_post_id, product_id, sort_order").in("video_post_id", postIds),
  ]);
  const shopById = new Map((shops.data ?? []).map((s) => [s.id as string, s]));
  const tagsByPost = new Map<string, string[]>();
  for (const tag of [...(tags.data ?? [])].sort((a, b) => Number(a.sort_order) - Number(b.sort_order))) {
    const key = tag.video_post_id as string;
    const cur = tagsByPost.get(key) ?? [];
    cur.push(tag.product_id as string);
    tagsByPost.set(key, cur);
  }

  const videos: PublicFeedVideo[] = list.map((row) => {
    const shop = shopById.get(row.business_id as string);
    return {
      id: row.id as string,
      business_id: row.business_id as string,
      profile_id: row.profile_id as string,
      caption: (row.caption as string | null) ?? null,
      captions_url: (row.captions_url as string | null) ?? null,
      cover_path: (row.cover_path as string | null) ?? null,
      playback_url: (row.playback_url as string | null) ?? null,
      storage_path: row.storage_path as string,
      duration_ms: (row.duration_ms as number | null) ?? null,
      attribution: (row.attribution as PublicFeedVideo["attribution"]) ?? "business",
      like_count: Number(row.like_count ?? 0),
      comment_count: Number(row.comment_count ?? 0),
      save_count: Number(row.save_count ?? 0),
      view_count: Number(row.view_count ?? 0),
      share_count: Number((row as { share_count?: number }).share_count ?? 0),
      image_urls: asUrlList((row as { image_urls?: unknown }).image_urls),
      published_at: (row.published_at as string | null) ?? (row.created_at as string),
      created_at: row.created_at as string,
      slug: (shop?.slug as string | undefined) ?? (row.business_id as string),
      business_name: displayShopName((shop?.business_name as string | undefined) ?? null),
      business_logo_url: (shop?.logo_url as string | null | undefined) ?? null,
      is_verified: Boolean(shop?.is_verified),
      verification_status: (shop?.verification_status as string | undefined) ?? "unverified",
      category_id: (shop?.category_id as string | null | undefined) ?? null,
      category_name: (shop?.category_name as string | null | undefined) ?? null,
      location_text: (shop?.location_text as string | null | undefined) ?? null,
      public_location_label: (shop?.public_location_label as string | null | undefined) ?? null,
      latitude: shop?.latitude != null ? Number(shop.latitude) : null,
      longitude: shop?.longitude != null ? Number(shop.longitude) : null,
      product_ids: tagsByPost.get(row.id as string) ?? [],
      media_kind: ((row as { media_kind?: string }).media_kind as PublicFeedVideo["media_kind"]) ?? null,
    };
  });
  return { videos: await attachShopNames(videos), error: null };
}

async function attachShopNames(videos: PublicFeedVideo[]): Promise<PublicFeedVideo[]> {
  const needsLookup = videos.filter(
    (v) => isBlankShopName(v.business_name) || !v.business_logo_url || !v.slug,
  );
  if (needsLookup.length === 0) {
    return videos.map((video) => ({
      ...video,
      share_count: Number(video.share_count ?? 0),
      image_urls: asUrlList(video.image_urls),
    }));
  }
  const businessIds = [...new Set(needsLookup.map((v) => v.business_id).filter(Boolean))];
  const found = businessIds.length ? await lookupShopProfiles(businessIds) : new Map();
  const stillBlank = videos.filter((v) => isBlankShopName(found.get(v.business_id)?.business_name ?? v.business_name));
  const needPhoto = videos.filter((v) => !(found.get(v.business_id)?.logo_url || v.business_logo_url));
  const [people, photos] = await Promise.all([
    stillBlank.length ? lookupProfileNames(stillBlank.map((v) => v.profile_id)) : Promise.resolve(new Map<string, string>()),
    needPhoto.length ? lookupProfilePhotos(needPhoto.map((v) => v.profile_id)) : Promise.resolve(new Map<string, string>()),
  ]);
  return videos.map((video) => {
    const shop = found.get(video.business_id);
    const person = people.get(video.profile_id) ?? null;
    return {
      ...video,
      share_count: Number(video.share_count ?? 0),
      image_urls: asUrlList(video.image_urls),
      business_name: displayShopName(shop?.business_name ?? video.business_name, person),
      slug: shop?.slug || video.slug || video.business_id,
      business_logo_url:
        shop?.logo_url || video.business_logo_url || photos.get(video.profile_id) || null,
      is_verified: shop?.is_verified ?? video.is_verified,
      verification_status: shop?.verification_status ?? video.verification_status,
      category_id: shop?.category_id ?? video.category_id,
      category_name: shop?.category_name ?? video.category_name,
      latitude: shop?.latitude ?? video.latitude ?? null,
      longitude: shop?.longitude ?? video.longitude ?? null,
    };
  });
}

const SIGNALS_TTL_MS = 5 * 60_000;
const signalsCache = new Map<string, { at: number; value: ViewerSignals }>();

export function invalidateFeedViewerSignals(profileId?: string | null) {
  if (profileId) signalsCache.delete(profileId);
  else signalsCache.clear();
}

export async function fetchFeedViewerSignals(
  profileId: string | null,
  geo?: { lat: number; lng: number } | null,
): Promise<ViewerSignals> {
  const empty: ViewerSignals = {
    followedBusinessIds: [],
    preferredCategoryIds: [],
    savedProductIds: [],
    completedVideoIds: [],
    blockedProfileIds: [],
    mutedProfileIds: [],
    viewerLat: geo?.lat ?? null,
    viewerLng: geo?.lng ?? null,
  };
  const cacheKey = profileId ?? "anon";
  const hit = signalsCache.get(cacheKey);
  if (hit && Date.now() - hit.at < SIGNALS_TTL_MS) {
    return {
      ...hit.value,
      viewerLat: geo?.lat ?? hit.value.viewerLat ?? null,
      viewerLng: geo?.lng ?? hit.value.viewerLng ?? null,
    };
  }
  if (!profileId) {
    signalsCache.set(cacheKey, { at: Date.now(), value: empty });
    return empty;
  }
  const supabase = getSupabaseBrowserClient();
  const [follows, favs, blocks, mutes, completes] = await Promise.all([
    supabase.from("business_follows").select("business_id").eq("profile_id", profileId),
    supabase.from("marketplace_favorites").select("product_id").eq("profile_id", profileId).not("product_id", "is", null),
    supabase.from("account_blocks").select("blocked_profile_id").eq("blocker_id", profileId),
    supabase.from("account_mutes").select("muted_profile_id").eq("muter_id", profileId),
    supabase.from("feed_events").select("video_post_id").eq("profile_id", profileId).eq("kind", "complete").limit(40),
  ]);
  const value: ViewerSignals = {
    followedBusinessIds: (follows.data ?? []).map((r) => r.business_id as string),
    preferredCategoryIds: [],
    savedProductIds: (favs.data ?? []).map((r) => r.product_id as string).filter(Boolean),
    completedVideoIds: (completes.data ?? []).map((r) => r.video_post_id as string),
    blockedProfileIds: (blocks.data ?? []).map((r) => r.blocked_profile_id as string),
    mutedProfileIds: (mutes.data ?? []).map((r) => r.muted_profile_id as string),
    viewerLat: geo?.lat ?? null,
    viewerLng: geo?.lng ?? null,
  };
  signalsCache.set(cacheKey, { at: Date.now(), value });
  return value;
}

export async function rankAndLoadFeed(
  profileId: string | null,
  opts?: {
    limit?: number;
    before?: string | null;
    viewerLat?: number | null;
    viewerLng?: number | null;
    nearbyOnly?: boolean;
    offset?: number;
    shuffleSalt?: string;
    seenVideoIds?: string[];
  },
): Promise<{
  videos: PublicFeedVideo[];
  nextCursor: string | null;
  error: string | null;
}> {
  const limit = opts?.limit ?? FEED_PAGE_SIZE;
  const before = opts?.before ?? null;
  const offset = before ? 0 : opts?.offset ?? 0;
  const geo =
    opts?.viewerLat != null && opts?.viewerLng != null
      ? { lat: opts.viewerLat, lng: opts.viewerLng }
      : null;
  const fetchLimit = Math.max(limit * 2, 16);

  const [raw, signals] = await Promise.all([
    fetchPublicVideoFeed({ limit: fetchLimit, before, offset: before ? 0 : offset }),
    fetchFeedViewerSignals(profileId, geo),
  ]);
  if (raw.error) return { videos: [], nextCursor: null, error: raw.error };
  signals = {
    ...signals,
    seenVideoIds: opts?.seenVideoIds ?? [],
    shuffleSalt: opts?.shuffleSalt,
  };

  const blocked = new Set(signals.blockedProfileIds);
  const muted = new Set(signals.mutedProfileIds);
  const visible = raw.videos.filter((v) => !blocked.has(v.profile_id) && !muted.has(v.profile_id));

  const withDistance = visible.map((video) => ({
    ...video,
    distance_km: shopDistanceKm(
      { latitude: video.latitude, longitude: video.longitude },
      signals,
    ),
  }));

  const pool = opts?.nearbyOnly
    ? geo
      ? withDistance.filter((v) => v.distance_km != null && v.distance_km <= NEARBY_RADIUS_KM)
      : withDistance.filter((v) => signals.followedBusinessIds.includes(v.business_id))
    : withDistance;

  const ranked = rankVideoFeed(
    pool.map((v) => ({
      id: v.id,
      businessId: v.business_id,
      profileId: v.profile_id,
      categoryId: v.category_id,
      productIds: v.product_ids ?? [],
      publishedAt: v.published_at,
      createdAt: v.created_at,
      likeCount: v.like_count,
      viewCount: v.view_count,
      attribution: v.attribution,
      hasAvailableProduct: (v.product_ids ?? []).length > 0,
      latitude: v.latitude,
      longitude: v.longitude,
    })),
    signals,
  );
  const byId = new Map(pool.map((v) => [v.id, v]));
  const rankedVideos = ranked.map((row) => byId.get(row.videoId)).filter(Boolean) as PublicFeedVideo[];
  const freshMs = 12 * 3_600_000;
  const stamp = (v: PublicFeedVideo) => new Date(v.published_at ?? v.created_at).getTime();
  const latest = rankedVideos
    .filter((v) => Date.now() - stamp(v) <= freshMs)
    .sort((a, b) => stamp(b) - stamp(a));
  const latestIds = new Set(latest.map((v) => v.id));
  const rest = rankedVideos.filter((v) => !latestIds.has(v.id));
  const videos = [...latest, ...rest];
  const page = videos.slice(0, limit);
  const last = raw.videos[raw.videos.length - 1];
  const nextCursor = raw.videos.length >= fetchLimit ? (last?.published_at ?? last?.created_at ?? null) : null;

  return { videos: page, nextCursor, error: null };
}

export async function fetchLiveProductsByIds(ids: string[]): Promise<{
  products: PublicProduct[];
  error: string | null;
}> {
  if (ids.length === 0) return { products: [], error: null };
  const supabase = getSupabaseBrowserClient();
  const full =
    "id, business_id, name, kind, description, sale_price, unit, image_url, extra_image_urls, attributes, variants, is_available, business_name, business_slug, service_type, starts_on, ends_on, business_location_text, business_public_location_label";
  const core =
    "id, business_id, name, kind, description, sale_price, unit, image_url, extra_image_urls, attributes, variants, is_available, business_name, business_slug";
  let { data, error } = await supabase.from("public_business_products").select(full).in("id", ids);
  if (error && /service_type|starts_on|ends_on|business_location/i.test(error.message)) {
    const retry = await supabase.from("public_business_products").select(core).in("id", ids);
    data = retry.data;
    error = retry.error;
  }
  if (error) return { products: [], error: error.message };
  return { products: await attachProductShopNames((data ?? []) as unknown as PublicProduct[]), error: null };
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

export async function fetchMyLikedVideoIds(profileId: string): Promise<Set<string>> {
  const local = loadUserSocial(profileId).likedVideos;
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.from("video_likes").select("video_post_id").eq("profile_id", profileId);
  return new Set([...local, ...((data ?? []).map((r) => r.video_post_id as string))]);
}

export async function fetchMySavedVideoIds(profileId: string): Promise<Set<string>> {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.from("video_saves").select("video_post_id").eq("profile_id", profileId);
  return new Set((data ?? []).map((r) => r.video_post_id as string));
}

export async function fetchMyFollowedBusinessIds(profileId: string): Promise<Set<string>> {
  const local = listFollowedShopIds(profileId);
  if (!profileId || profileId === "guest") return new Set(local);
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.from("business_follows").select("business_id").eq("profile_id", profileId);
  return new Set([...local, ...((data ?? []).map((r) => r.business_id as string))]);
}

export async function toggleVideoLike(profileId: string, videoId: string): Promise<{ liked: boolean; error: string | null }> {
  if (isMockFeedId(videoId)) {
    return { liked: false, error: "This post is not available." };
  }
  const supabase = getSupabaseBrowserClient();
  const { data: existing } = await supabase
    .from("video_likes")
    .select("profile_id")
    .eq("profile_id", profileId)
    .eq("video_post_id", videoId)
    .maybeSingle();
  if (existing) {
    const { error } = await supabase.from("video_likes").delete().eq("profile_id", profileId).eq("video_post_id", videoId);
    return { liked: false, error: error?.message ?? null };
  }
  const { error } = await supabase.from("video_likes").insert({ profile_id: profileId, video_post_id: videoId });
  if (error?.code === "23505") return { liked: true, error: null };
  return { liked: true, error: error?.message ?? null };
}

export async function toggleVideoSave(profileId: string, videoId: string): Promise<{ saved: boolean; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { data: existing } = await supabase
    .from("video_saves")
    .select("profile_id")
    .eq("profile_id", profileId)
    .eq("video_post_id", videoId)
    .maybeSingle();
  if (existing) {
    const { error } = await supabase.from("video_saves").delete().eq("profile_id", profileId).eq("video_post_id", videoId);
    return { saved: false, error: error?.message ?? null };
  }
  const { error } = await supabase.from("video_saves").insert({ profile_id: profileId, video_post_id: videoId });
  return { saved: true, error: error?.message ?? null };
}

export async function toggleFollowBusiness(
  profileId: string,
  businessId: string,
  actorName?: string | null,
): Promise<{ following: boolean; error: string | null }> {
  if (isMockFeedId(businessId)) {
    return { following: false, error: "This shop is not available." };
  }
  const supabase = getSupabaseBrowserClient();
  const { data: existing } = await supabase
    .from("business_follows")
    .select("profile_id")
    .eq("profile_id", profileId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (existing) {
    const { error } = await supabase
      .from("business_follows")
      .delete()
      .eq("profile_id", profileId)
      .eq("business_id", businessId);
    if (!error && isFollowingShop(profileId, businessId)) {
      toggleFollowShopLocal(profileId, businessId, { name: actorName });
    }
    return { following: false, error: error?.message ?? null };
  }
  const { error } = await supabase.from("business_follows").insert({ profile_id: profileId, business_id: businessId });
  if (!error && !isFollowingShop(profileId, businessId)) {
    toggleFollowShopLocal(profileId, businessId, { name: actorName ?? null });
  }
  return { following: true, error: error?.message ?? null };
}

export async function fetchVideoComments(videoId: string): Promise<{ comments: VideoComment[]; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("video_comments")
    .select("id, video_post_id, profile_id, parent_id, body, created_at")
    .eq("video_post_id", videoId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) return { comments: [], error: error.message };
  const comments = (data ?? []) as VideoComment[];
  const ids = [...new Set(comments.map((c) => c.profile_id))];
  if (ids.length === 0) return { comments, error: null };
  const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", ids);
  const names = new Map((profiles ?? []).map((p) => [p.id as string, p.full_name as string]));
  return {
    comments: comments.map((c) => ({ ...c, author_name: names.get(c.profile_id) ?? "Shopper" })),
    error: null,
  };
}

export async function postVideoComment(input: {
  profileId: string;
  videoId: string;
  body: string;
  parentId?: string | null;
}): Promise<{ error: string | null }> {
  const text = input.body.trim();
  if (!text) return { error: "Write a comment first." };
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("video_comments").insert({
    profile_id: input.profileId,
    video_post_id: input.videoId,
    parent_id: input.parentId ?? null,
    body: text,
  });
  return { error: error?.message ?? null };
}

export async function updateVideoComment(input: {
  commentId: string;
  profileId: string;
  body: string;
}): Promise<{ error: string | null }> {
  const text = input.body.trim();
  if (!text) return { error: "Write a comment first." };
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from("video_comments")
    .update({ body: text })
    .eq("id", input.commentId)
    .eq("profile_id", input.profileId);
  return { error: error?.message ?? null };
}

export async function deleteVideoComment(input: {
  commentId: string;
  profileId: string;
}): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from("video_comments")
    .delete()
    .eq("id", input.commentId)
    .eq("profile_id", input.profileId);
  return { error: error?.message ?? null };
}

export async function reportVideo(input: {
  reporterId: string;
  videoId: string;
  businessId: string;
  reason: "spam" | "scam" | "hate" | "sexual" | "violence" | "other";
  details?: string;
}): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("video_reports").insert({
    reporter_id: input.reporterId,
    video_post_id: input.videoId,
    business_id: input.businessId,
    reason: input.reason,
    details: input.details?.trim() || null,
  });
  if (error?.code === "23505") return { error: "You already reported this video." };
  return { error: error?.message ?? null };
}

export async function blockProfile(blockerId: string, blockedId: string): Promise<{ error: string | null }> {
  if (blockerId === blockedId) return { error: "You cannot block yourself." };
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from("account_blocks")
    .insert({ blocker_id: blockerId, blocked_profile_id: blockedId });
  if (error?.code === "23505") return { error: null };
  return { error: error?.message ?? null };
}

export async function muteProfile(muterId: string, mutedId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("account_mutes").insert({ muter_id: muterId, muted_profile_id: mutedId });
  if (error?.code === "23505") return { error: null };
  return { error: error?.message ?? null };
}

const VIDEO_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function recordFeedSignal(
  videoId: string,
  kind: "view" | "complete" | "product_tap" | "add_to_cart" | "share" | "like" | "impression",
): Promise<void> {
  if (!VIDEO_ID_RE.test(videoId)) return;
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("record_feed_event", { p_video_id: videoId, p_kind: kind });
  if (error && /impression/i.test(error.message) && kind === "impression") {
    await supabase.rpc("record_feed_event", { p_video_id: videoId, p_kind: "view" });
  }
}

export async function publishShoppingVideo(input: {
  businessId: string;
  profileId: string;
  file: File;
  caption: string;
  productIds: string[];
  products: { id: string; business_id: string }[];
  attribution: VideoAttribution;
  captionsFile?: File | null;
}): Promise<{ error: string | null; videoId?: string }> {
  return submitStudioVideo({
    businessId: input.businessId,
    profileId: input.profileId,
    file: input.file,
    caption: input.caption,
    productIds: input.productIds,
    products: input.products,
    attribution: input.attribution,
    rightsAttested: true,
  });
}
