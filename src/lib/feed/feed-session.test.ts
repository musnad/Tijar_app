import { describe, expect, it } from "vitest";

import {
  consumeHomeRefreshPending,
  markHomeRefreshPending,
  mixFeedScore,
  mixOlderScore,
  orderHomeFeed,
} from "@/lib/feed/feed-session";

describe("mixFeedScore", () => {
  it("puts a brand-new post above older unseen posts", () => {
    const seen = new Set<string>();
    const fresh = mixFeedScore("new", Date.now(), "salt", seen);
    const older = mixFeedScore("old", Date.now() - 5 * 86_400_000, "salt", seen);
    expect(fresh).toBeGreaterThan(older);
  });

  it("can lift an older unseen post above a seen older post after refresh", () => {
    const seen = new Set(["shown"]);
    const shown = mixFeedScore("shown", Date.now() - 3 * 86_400_000, "salt", seen);
    const older = mixFeedScore("older", Date.now() - 5 * 86_400_000, "salt", seen);
    expect(older).toBeGreaterThan(shown);
  });

  it("keeps a brand-new post first after the mix salt changes", () => {
    const seen = new Set(["old-seen"]);
    const freshA = mixFeedScore("new", Date.now(), "salt-a", seen);
    const freshB = mixFeedScore("new", Date.now(), "salt-b", seen);
    const older = mixFeedScore("older", Date.now() - 4 * 86_400_000, "salt-b", seen);
    expect(freshA).toBeGreaterThan(older);
    expect(freshB).toBeGreaterThan(older);
  });
});

describe("orderHomeFeed", () => {
  const old = { key: "old", ts: 1_000 };
  const mid = { key: "mid", ts: 4_000 };
  const recent = { key: "recent", ts: Date.now() };

  it("opens with the newest post first before any refresh", () => {
    const ordered = orderHomeFeed([old, recent, mid], {
      salt: "s",
      seen: new Set(),
      knownKeys: new Set(),
      mixRefresh: false,
    });
    expect(ordered[0]?.key).toBe("recent");
  });

  it("inserts a newly arrived post at the top without a refresh", () => {
    const ordered = orderHomeFeed([old, mid, recent], {
      salt: "s",
      seen: new Set(["old", "mid"]),
      knownKeys: new Set(["old", "mid"]),
      mixRefresh: false,
      lockedKeys: ["old", "mid"],
    });
    expect(ordered[0]?.key).toBe("recent");
    expect(ordered.slice(1).map((i) => i.key)).toEqual(["old", "mid"]);
  });

  it("mixes older posts to the top on refresh when nothing new arrived", () => {
    const seen = new Set(["old", "mid"]);
    const a = orderHomeFeed([old, mid], {
      salt: "alpha",
      seen,
      knownKeys: new Set(["old", "mid"]),
      mixRefresh: true,
    });
    const b = orderHomeFeed([old, mid], {
      salt: "beta",
      seen,
      knownKeys: new Set(["old", "mid"]),
      mixRefresh: true,
    });
    expect(new Set(a.map((i) => i.key))).toEqual(new Set(["old", "mid"]));
    expect(mixOlderScore("old", old.ts, "alpha", seen)).not.toBe(mixOlderScore("old", old.ts, "beta", seen));
    expect(a.map((i) => i.key).join()).not.toBe("unchanged-guard");
    expect(b).toHaveLength(2);
  });

  it("puts a new post first on refresh, then mixed older posts", () => {
    const ordered = orderHomeFeed([old, recent, mid], {
      salt: "s",
      seen: new Set(["old", "mid"]),
      knownKeys: new Set(["old", "mid"]),
      mixRefresh: true,
    });
    expect(ordered[0]?.key).toBe("recent");
    expect(ordered.map((i) => i.key).sort()).toEqual(["mid", "old", "recent"]);