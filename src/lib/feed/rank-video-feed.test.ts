import { describe, expect, it } from "vitest";

import {
  applyOrganicInterleave,
  rankVideoFeed,
  scoreVideo,
  type RankableVideo,
  type ViewerSignals,
} from "@/lib/feed/rank-video-feed";

function video(partial: Partial<RankableVideo> & Pick<RankableVideo, "id">): RankableVideo {
  return {
    businessId: "biz-a",
    profileId: "p-a",
    categoryId: "cat-food",
    productIds: ["prod-1"],
    publishedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    likeCount: 0,
    viewCount: 0,
    attribution: "business",
    hasAvailableProduct: true,
    ...partial,
  };
}

const emptyViewer: ViewerSignals = {
  followedBusinessIds: [],
  preferredCategoryIds: [],
  savedProductIds: [],
  completedVideoIds: [],
  blockedProfileIds: [],
  mutedProfileIds: [],
};

describe("scoreVideo", () => {
  it("boosts followed sellers and available products", () => {
    const v = video({ id: "v1", businessId: "biz-a" });
    const followed = scoreVideo(v, { ...emptyViewer, followedBusinessIds: ["biz-a"] });
    const not = scoreVideo(v, emptyViewer);
    expect(followed.score).toBeGreaterThan(not.score);
    expect(followed.reasons).toContain("followed seller");
    expect(followed.reasons).toContain("in-stock tagged product");
  });

  it("hides blocked creators", () => {
    const v = video({ id: "v2", profileId: "bad" });
    const r = scoreVideo(v, { ...emptyViewer, blockedProfileIds: ["bad"] });
    expect(r.score).toBeLessThan(0);
  });

  it("does not let sponsored outrank organic when not followed", () => {
    const organic = video({ id: "o1", attribution: "business", publishedAt: new Date().toISOString() });
    const ad = video({
      id: "ad1",
      attribution: "sponsored",
      businessId: "biz-ad",
      publishedAt: new Date().toISOString(),
    });
    const ranked = rankVideoFeed([ad, organic], emptyViewer);
    expect(ranked[0]?.videoId).toBe("o1");
    expect(ranked.find((x) => x.videoId === "ad1")?.reasons).toContain(
      "sponsored demoted in organic rank",
    );
  });

  it("gives new sellers a discovery boost", () => {
    const newbie = video({ id: "n1", sellerPublishedAt: new Date().toISOString() });
    const r = scoreVideo(newbie, emptyViewer);
    expect(r.reasons).toContain("new seller discovery boost");
  });

  it("ranks a nearby shop above a distant followed shop", () => {
    const nearby = video({
      id: "near",
      businessId: "biz-near",
      latitude: 6.5244,
      longitude: 3.3792,
      hasAvailableProduct: false,
    });
    const distantFollowed = video({
      id: "far",
      businessId: "biz-far",
      latitude: 12.0022,
      longitude: 8.592,
      hasAvailableProduct: false,
    });
    const viewer: ViewerSignals = {
      ...emptyViewer,
      followedBusinessIds: ["biz-far"],
      viewerLat: 6.5244,
      viewerLng: 3.3792,
    };
    const ranked = rankVideoFeed([distantFollowed, nearby], viewer);
    expect(ranked[0]?.videoId).toBe("near");
    expect(ranked.find((x) => x.videoId === "near")?.reasons).toContain("within 5 km");
  });
});

describe("applyOrganicInterleave", () => {
  it("does not lead the feed with unfollowed sponsored posts", () => {
    const byId = new Map([
      ["a", { id: "a", attribution: "business" as const }],
      ["ad", { id: "ad", attribution: "sponsored" as const }],
    ]);
    expect(applyOrganicInterleave(["ad", "a"], byId, 8)[0]).toBe("a");
  });
});
