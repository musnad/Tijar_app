/**
 * Explainable, rule-based For You ranking. Not machine learning.
 * Paid/sponsored items never outrank organic unless the shopper already follows that seller.
 * Nearby shops (real GPS) outrank distant ones so the feed feels local.
 */

import { haversineKm } from "@/utils/discover";

export type VideoAttribution = "business" | "creator" | "sponsored" | "ai_assisted";

export type RankableVideo = {
  id: string;
  businessId: string;
  profileId: string;
  categoryId: string | null;
  productIds: string[];
  publishedAt: string | null;
  createdAt: string;
  likeCount: number;
  viewCount: number;
  attribution: VideoAttribution;
  hasAvailableProduct: boolean;
  sellerPublishedAt?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type ViewerSignals = {
  followedBusinessIds: string[];
  preferredCategoryIds: string[];
  savedProductIds: string[];
  completedVideoIds: string[];
  blockedProfileIds: string[];
  mutedProfileIds: string[];
  searchQuery?: string;
  videoCaptions?: Record<string, string>;
  viewerLat?: number | null;
  viewerLng?: number | null;
  seenVideoIds?: string[];
  shuffleSalt?: string;
};

export type RankBreakdown = {
  videoId: string;
  score: number;
  reasons: string[];
};

const FOLLOWED = 40;
const CATEGORY = 15;
const SAVED_PRODUCT = 12;
const COMPLETION = 8;
const FRESHNESS = 10;
const AVAILABILITY = 14;
const NEW_SELLER = 9;
const QUALITY = 4;
const SEARCH = 18;
const SPONSORED_PENALTY = 25;
const NEARBY_CLOSE = 55;
const NEARBY_MID = 32;
const NEARBY_CITY = 8;

export const NEARBY_RADIUS_KM = 15;
export const CLOSE_RADIUS_KM = 5;

export function shopDistanceKm(
  video: Pick<RankableVideo, "latitude" | "longitude">,
  viewer: Pick<ViewerSignals, "viewerLat" | "viewerLng">,
): number | null {
  if (
    viewer.viewerLat == null ||
    viewer.viewerLng == null ||
    video.latitude == null ||
    video.longitude == null ||
    !Number.isFinite(video.latitude) ||
    !Number.isFinite(video.longitude)
  ) {
    return null;
  }
  return haversineKm(
    { lat: viewer.viewerLat, lng: viewer.viewerLng },
    { lat: video.latitude, lng: video.longitude },
  );
}

function daysSince(iso: string | null | undefined): number {
  if (!iso) return 999;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, ms / 86_400_000);
}

function freshnessScore(iso: string | null): number {
  const d = daysSince(iso);
  if (d <= 1) return FRESHNESS;
  if (d <= 7) return FRESHNESS * 0.7;
  if (d <= 30) return FRESHNESS * 0.4;
  return FRESHNESS * 0.15;
}

export function scoreVideo(video: RankableVideo, viewer: ViewerSignals): RankBreakdown {
  const reasons: string[] = [];
  let score = 0;

  if (viewer.blockedProfileIds.includes(video.profileId)) {
    return { videoId: video.id, score: -10_000, reasons: ["blocked creator"] };
  }
  if (viewer.mutedProfileIds.includes(video.profileId)) {
    return { videoId: video.id, score: -5_000, reasons: ["muted creator"] };
  }

  const km = shopDistanceKm(video, viewer);
  if (km != null) {
    if (km <= CLOSE_RADIUS_KM) {
      score += NEARBY_CLOSE;
      reasons.push("within 5 km");
    } else if (km <= NEARBY_RADIUS_KM) {
      score += NEARBY_MID;
      reasons.push("nearby");
    } else if (km <= 40) {
      score += NEARBY_CITY;
      reasons.push("same city");
    }
  }

  const followed = viewer.followedBusinessIds.includes(video.businessId);
  if (followed) {
    score += FOLLOWED;
    reasons.push("followed seller");
  }

  if (video.categoryId && viewer.preferredCategoryIds.includes(video.categoryId)) {
    score += CATEGORY;
    reasons.push("preferred category");
  }

  const savedOverlap = video.productIds.some((id) => viewer.savedProductIds.includes(id));
  if (savedOverlap) {
    score += SAVED_PRODUCT;
    reasons.push("saved related product");
  }

  if (viewer.completedVideoIds.includes(video.id)) {
    score += COMPLETION;
    reasons.push("previously watched through");
  }

  const fresh = freshnessScore(video.publishedAt ?? video.createdAt);
  score += fresh;
  if (fresh >= FRESHNESS * 0.7) reasons.push("recent post");
  const published = video.publishedAt ?? video.createdAt;
  const fresh = freshnessScore(published);
  score += fresh;
  if (fresh >= FRESHNESS * 0.7) reasons.push("recent post");

  if (viewer.seenVideoIds?.includes(video.id)) {
    score -= SEEN_PENALTY;
    reasons.push("already shown this session");
  } else if (daysSince(published) > 1) {
    score += OLDER_UNSEEN;
    reasons.push("older post you have not seen");
  }

  if (viewer.shuffleSalt) {
    let h = 2166136261;
    const key = `${viewer.shuffleSalt}:${video.id}`;
    for (let i = 0; i < key.length; i += 1) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
    score += ((h >>> 0) % (SHUFFLE_JITTER * 10)) / 10;
  }
    reasons.push("in-stock tagged product");
  }

  const sellerAge = daysSince(video.sellerPublishedAt ?? video.publishedAt);
  if (sellerAge <= 14) {
    score += NEW_SELLER;
    reasons.push("new seller discovery boost");
  }

  if (video.likeCount + video.viewCount > 0) {
    score += QUALITY;
  }

  const q = viewer.searchQuery?.trim().toLowerCase();
  if (q) {
    const caption = (viewer.videoCaptions?.[video.id] ?? "").toLowerCase();
    if (caption.includes(q)) {
      score += SEARCH;
      reasons.push("search relevance");
    }
  }

  if (video.attribution === "sponsored" && !followed) {
    score -= SPONSORED_PENALTY;
    reasons.push("sponsored demoted in organic rank");
  }

  return { videoId: video.id, score, reasons };
}

export function rankVideoFeed(videos: RankableVideo[], viewer: ViewerSignals): RankBreakdown[] {
  return videos
    .map((v) => scoreVideo(v, viewer))
    .sort((a, b) => b.score - a.score || a.videoId.localeCompare(b.videoId));
}

export function applyOrganicInterleave<T extends { id: string; attribution?: VideoAttribution }>(
  orderedIds: string[],
  byId: Map<string, T>,
  everyN = 8,
): string[] {
  const organic: string[] = [];
  const sponsored: string[] = [];
  for (const id of orderedIds) {
    const row = byId.get(id);
    if (row?.attribution === "sponsored") sponsored.push(id);
    else organic.push(id);
  }
  if (sponsored.length === 0) return organic;
  const out: string[] = [];
  let s = 0;
  organic.forEach((id, i) => {
    out.push(id);
    if ((i + 1) % everyN === 0 && s < sponsored.length) {
      out.push(sponsored[s]!);
      s += 1;
    }
  });
  while (s < sponsored.length) {
    out.push(sponsored[s]!);
    s += 1;
  }
  return out;
}
