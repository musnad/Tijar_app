import { displayShopName, shopLinkSlug } from "@/lib/shop-names";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { publishPlaceOrderListing } from "@/services/place-order-service";
import { uploadProductImage } from "@/services/product-image-service";
import { createProduct, updateProductImageUrl } from "@/services/product-service";
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
  like_count: number;
  comment_count: number;
  product_name?: string | null;
  product_image?: string | null;
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
    like_count: Number(row.like_count ?? 0),
    comment_count: Number(row.comment_count ?? 0),
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

  let stories = rows.map((row) => asStory(row as Record<string, unknown>));
  if (stories.length === 0) return { rings: [], error: null };

  const productIds = [...new Set(stories.map((s) => s.product_id).filter(Boolean))] as string[];
  if (productIds.length > 0) {
    const products = await supabase.from("products").select("id, name, image_url, sale_price").in("id", productIds);
    const byId = new Map((products.data ?? []).map((p) => [p.id as string, p]));
    stories = stories.map((story) => {
      const product = story.product_id ? byId.get(story.product_id) : undefined;
      return {
        ...story,
        product_name: (product?.name as string | undefined) ?? story.product_name ?? null,
        product_image: (product?.image_url as string | undefined) ?? story.product_image ?? null,
        price: story.price ?? (product?.sale_price != null ? Number(product.sale_price) : null),
      };
    });
  }

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
  offerKind?: "product" | "place_order";
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
  const mediaUrl = publicStoryUrl(storagePath);

  const name = input.overlayText?.trim() || "";
  const price = input.price != null && Number.isFinite(input.price) && input.price > 0 ? input.price : null;
  let productId = input.productId || null;
  if (!productId) {
    if (!name) return { error: "Add a name so shoppers can order this." };
    if (price == null) return { error: "Add a price so shoppers can order this." };
    const created = await createProduct(input.businessId, input.profileId, {
      name,
      kind: "goods",
      unit: "piece",
      salePrice: price,
      isPublished: true,
      initialStock: 10,
      notes: "Created from story",
      ...(isVideo ? { videoUrl: mediaUrl } : {}),
    });
    if (created.error || !created.product) return { error: created.error ?? "Could not create the product for this story." };
    productId = created.product.id;
    if (!isVideo) {
      const uploaded = await uploadProductImage(input.businessId, productId, input.file);
      if (uploaded.publicUrl) await updateProductImageUrl(productId, uploaded.publicUrl);
      else await updateProductImageUrl(productId, mediaUrl);
    }
  }

  let listingId: string | null = null;
  if (input.offerKind === "place_order") {
    if (price == null) return { error: "Add a price so shoppers can place an order." };
    const photos = isVideo ? [] : [input.file];
    const listing = await publishPlaceOrderListing({
      businessId: input.businessId,
      title: name || "Place your order",
      details: "",
      category: "other",
      price,
      photos,
      existingUrls: isVideo ? [mediaUrl] : [],
      locationLabel: "",
      availableOn: "today",
      pickupEnabled: true,
      deliveryEnabled: true,
    });
    if (listing.error || !listing.listing) return { error: listing.error ?? "Could not create Place your order." };
    listingId = listing.listing.id;
  }

  const row: Record<string, unknown> = {
    id,
    business_id: input.businessId,
    profile_id: input.profileId,
    media_kind: isVideo ? "video" : "image",
    storage_path: storagePath,
    overlay_text: name || null,
    price,
    product_id: productId,
    duration_ms: isVideo ? Math.min(input.durationMs ?? 7000, 20000) : 5000,
  };
  if (listingId) row.place_order_listing_id = listingId;

  let { data, error } = await supabase.from("business_stories").insert(row).select("id").maybeSingle();
  if (error && listingId && /place_order_listing_id/i.test(error.message)) {
    delete row.place_order_listing_id;
    const retry = await supabase.from("business_stories").insert(row).select("id").maybeSingle();
    data = retry.data;
    error = retry.error;
  }
  if (error) return { error: error.message };
  return { error: null, id: data?.id ?? id };
}

/** Repost someone else's post onto your 24h story without creating a new product. */
export async function publishStoryReshare(input: {
  businessId: string;
  profileId: string;
  mediaUrl: string;
  mediaKind?: "image" | "video";
  overlayText?: string | null;
  productId?: string | null;
  price?: number | null;
}): Promise<{ error: string | null; id?: string }> {
  const mediaUrl = input.mediaUrl.trim();
  if (!mediaUrl) return { error: "This post has no photo or video to add to your story." };
  const supabase = getSupabaseBrowserClient();
  const id = crypto.randomUUID();
  const { data, error } = await supabase
    .from("business_stories")
    .insert({
      id,
      business_id: input.businessId,
      profile_id: input.profileId,
      media_kind: input.mediaKind === "video" ? "video" : "image",
      storage_path: `${input.businessId}/share-${id}`,
      playback_url: mediaUrl,
      overlay_text: input.overlayText?.trim() || null,
      price: input.price ?? null,
      product_id: input.productId || null,
      duration_ms: input.mediaKind === "video" ? 7000 : 5000,
    })
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  return { error: null, id: data?.id ?? id };
}

export async function toggleStoryLike(
  profileId: string,
  storyId: string,
): Promise<{ liked: boolean; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { data: existing } = await supabase
    .from("business_story_likes")
    .select("profile_id")
    .eq("profile_id", profileId)
    .eq("story_id", storyId)
    .maybeSingle();
  if (existing) {
    const { error } = await supabase
      .from("business_story_likes")
      .delete()
      .eq("profile_id", profileId)
      .eq("story_id", storyId);
    return { liked: false, error: error?.message ?? null };
  }
  const { error } = await supabase.from("business_story_likes").insert({ profile_id: profileId, story_id: storyId });
  if (error?.code === "23505") return { liked: true, error: null };
  return { liked: true, error: error?.message ?? null };
}

export async function fetchMyStoryLikedIds(profileId: string, storyIds: string[]): Promise<Set<string>> {
  if (!profileId || storyIds.length === 0) return new Set();
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase
    .from("business_story_likes")
    .select("story_id")
    .eq("profile_id", profileId)
    .in("story_id", storyIds);
  return new Set((data ?? []).map((r) => r.story_id as string));
}

export async function postStoryComment(profileId: string, storyId: string, body: string): Promise<{ error: string | null }> {
  const text = body.trim();
  if (!text) return { error: "Write a reply first." };
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("business_story_comments").insert({
    profile_id: profileId,
    story_id: storyId,
    body: text,
  });
  return { error: error?.message ?? null };
}

export async function fetchStoryComments(storyId: string): Promise<{
  comments: Array<{ id: string; body: string; created_at: string; author_name: string }>;
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("business_story_comments")
    .select("id, body, created_at, profile_id")
    .eq("story_id", storyId)
    .order("created_at", { ascending: true })
    .limit(80);
  if (error) return { comments: [], error: error.message };
  const ids = [...new Set((data ?? []).map((r) => r.profile_id as string))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", ids);
    for (const row of profiles ?? []) names.set(row.id as string, (row.full_name as string) || "Shopper");
  }
  return {
    comments: (data ?? []).map((row) => ({
      id: row.id as string,
      body: row.body as string,
      created_at: row.created_at as string,
      author_name: names.get(row.profile_id as string) ?? "Shopper",
    })),
    error: null,
  };
}

export type StoryViewerPerson = {
  profileId: string;
  name: string;
  avatarUrl: string | null;
  viewedAt: string;
};

export async function fetchStoryViewers(storyId: string): Promise<{ people: StoryViewerPerson[]; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("business_story_views")
    .select("profile_id, viewed_at")
    .eq("story_id", storyId)
    .order("viewed_at", { ascending: false })
    .limit(200);
  if (error) return { people: [], error: error.message };
  const ids = (data ?? []).map((r) => r.profile_id as string);
  if (ids.length === 0) return { people: [], error: null };
  const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids);
  const byId = new Map((profiles ?? []).map((p) => [p.id as string, p]));
  return {
    people: (data ?? []).map((row) => {
      const person = byId.get(row.profile_id as string);
      return {
        profileId: row.profile_id as string,
        name: ((person?.full_name as string | null) ?? "Shopper").trim() || "Shopper",
        avatarUrl: (person?.avatar_url as string | null) ?? null,
        viewedAt: row.viewed_at as string,
      };
    }),
    error: null,
  };
}
