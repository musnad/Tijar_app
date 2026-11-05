import { displayShopName, shopLinkSlug } from "@/lib/shop-names";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { haversineKm } from "@/utils/discover";

export type LiveStory = {
  id: string;
  business_id: string;
  profile_id: string;
  media_kind: "image" | "video";
  storage_path: string;
  playback_url: string | null;
  cover_path: string | null;
  overlay_text: string | null;
  price: number | null;
  product_id: string | null;
  duration_ms: number | null;
  expires_at: string;
  created_at: string;
  slug: string;
  business_name: string;
  business_logo_url: string | null;
  is_verified: boolean;
  latitude: number | null;
  longitude: number | null;
  location_text: string | null;
  public_location_label: string | null;
  media_url: string;
};

export type StoryRing = {
  businessId: string;
  businessName: string;
  logoUrl: string | null;
  slug: string;
  isVerified: boolean;
  unseen: boolean;
  distanceKm: number | null;
  locationLabel: string | null;
  stories: LiveStory[];
};

function publicStoryUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("http") || path.startsWith("/")) return path;
  const supabase = getSupabaseBrowserClient();
  return supabase.storage.from("business-stories").getPublicUrl(path).data.publicUrl;
}

function asStory(row: Record<string, unknown>): LiveStory {
  const storagePath = String(row.storage_path ?? "");
  const playback = (row.playback_url as string | null) ?? null;
  return {
    id: row.id as string,
    business_id: row.business_id as string,
    profile_id: row.profile_id as string,
    media_kind: row.media_kind === "video" ? "video" : "image",
    storage_path: storagePath,
    playback_url: playback,
    cover_path: (row.cover_path as string | null) ?? null,
    overlay_text: (row.overlay_text as string | null) ?? null,
    price: row.price != null ? Number(row.price) : null,
    product_id: (row.product_id as string | null) ?? null,
    duration_ms: (row.duration_ms as number | null) ?? null,
    expires_at: row.expires_at as string,
    created_at: row.created_at as string,
    slug: shopLinkSlug((row.slug as string | null) ?? null, row.business_id as string),
    business_name: displayShopName((row.business_name as string | null) ?? null),
    business_logo_url: (row.business_logo_url as string | null) ?? null,
    is_verified: Boolean(row.is_verified),
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
    location_text: (row.location_text as string | null) ?? null,
    public_location_label: (row.public_location_label as string | null) ?? null,
    media_url: publicStoryUrl(playback || storagePath),
  };
}

function missingTable(message: string | undefined): boolean {
  return Boolean(message && /schema cache|does not exist|public_live_stories|business_stories/i.test(message));
}

export async function fetchLiveStoryRings(opts: {
  profileId: string | null;
  followedIds: Set<string>;
  viewerLat?: number | null;
  viewerLng?: number | null;
}): Promise<{ rings: StoryRing[]; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const live = await supabase.from("public_live_stories").select("*").order("created_at", { ascending: true }).limit(200);
  let rows = live.data ?? [];
  if (live.error) {
    if (missingTable(live.error.message)) return { rings: [], error: null };
    const fallback = await supabase
      .from("business_stories")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(200);
    if (fallback.error) {
      if (missingTable(fallback.error.message)) return { rings: [], error: null };
      return { rings: [], error: fallback.error.message };
    }
    rows = fallback.data ?? [];
  }

  const stories = rows.map((row) => asStory(row as Record<string, unknown>));
  if (stories.length === 0) return { rings: [], error: null };

  let viewed = new Set<string>();
  if (opts.profileId) {
    const views = await supabase
      .from("business_story_views")
      .select("story_id")
      .eq("profile_id", opts.profileId)
      .in(
        "story_id",
        stories.map((s) => s.id),
      );
    if (!views.error) viewed = new Set((views.data ?? []).map((r) => r.story_id as string));
  }

  const byShop = new Map<string, LiveStory[]>();
  for (const story of stories) {
    const list = byShop.get(story.business_id) ?? [];
    list.push(story);
    byShop.set(story.business_id, list);
  }

  const rings: StoryRing[] = [...byShop.entries()].map(([businessId, list]) => {
    const first = list[0]!;
    const lat = first.latitude;
    const lng = first.longitude;
    const distanceKm =
      opts.viewerLat != null && opts.viewerLng != null && lat != null && lng != null
        ? haversineKm({ lat: opts.viewerLat, lng: opts.viewerLng }, { lat, lng })
        : null;
    return {
      businessId,
      businessName: first.business_name,
      logoUrl: first.business_logo_url,
      slug: first.slug,
      isVerified: first.is_verified,
      unseen: list.some((s) => !viewed.has(s.id)),
      distanceKm,
      locationLabel: first.public_location_label ?? first.location_text,
      stories: list,
    };
  });

  rings.sort((a, b) => {
    const aFollow = opts.followedIds.has(a.businessId) ? 1 : 0;
    const bFollow = opts.followedIds.has(b.businessId) ? 1 : 0;
    const aNear = a.distanceKm != null && a.distanceKm <= 15 ? 1 : 0;
    const bNear = b.distanceKm != null && b.distanceKm <= 15 ? 1 : 0;
    if (a.unseen !== b.unseen) return a.unseen ? -1 : 1;
    if (aNear !== bNear) return bNear - aNear;
    if (aFollow !== bFollow) return bFollow - aFollow;
    const ad = a.distanceKm ?? 9_999;
    const bd = b.distanceKm ?? 9_999;
    return ad - bd;
  });

  return { rings, error: null };
}

export async function markStoriesViewed(profileId: string, storyIds: string[]): Promise<void> {
  if (!profileId || storyIds.length === 0) return;
  const supabase = getSupabaseBrowserClient();
  await supabase.from("business_story_views").upsert(
    storyIds.map((story_id) => ({ story_id, profile_id: profileId })),
    { onConflict: "story_id,profile_id", ignoreDuplicates: true },
  );
}

export async function publishBusinessStory(input: {
  businessId: string;
  profileId: string;
  file: File;
  overlayText?: string;
  price?: number | null;
  productId?: string | null;
  durationMs?: number | null;
}): Promise<{ error: string | null; id?: string }> {
  const supabase = getSupabaseBrowserClient();
  const isVideo = input.file.type.startsWith("video/");
  const ext = isVideo ? (input.file.type.includes("webm") ? "webm" : "mp4") : input.file.type.includes("png") ? "png" : "jpg";
  const id = crypto.randomUUID();
  const storagePath = `${input.businessId}/${id}.${ext}`;
  const { error: upErr } = await supabase.storage.from("business-stories").upload(storagePath, input.file, {
    contentType: input.file.type || (isVideo ? "video/mp4" : "image/jpeg"),
    upsert: false,
  });
  if (upErr) return { error: upErr.message };

  const { data, error } = await supabase
    .from("business_stories")
    .insert({
      id,
      business_id: input.businessId,
      profile_id: input.profileId,
      media_kind: isVideo ? "video" : "image",
      storage_path: storagePath,
      overlay_text: input.overlayText?.trim() || null,
      price: input.price ?? null,
      product_id: input.productId || null,
      duration_ms: isVideo ? Math.min(input.durationMs ?? 7000, 20000) : 5000,
    })
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  return { error: null, id: data?.id ?? id };
}
