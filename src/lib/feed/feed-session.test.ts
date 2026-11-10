import { describe, expect, it } from "vitest";

import {
  consumeHomeRefreshPending,
  markHomeRefreshPending,
  mixFeedScore,
  pinNewestFirst,
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

describe("pinNewestFirst", () => {
  it("moves the newest product to the first slot", () => {
    const items = [
      { key: "old", ts: 1 },
      { key: "product", ts: 9 },
      { key: "mid", ts: 4 },
    ];
    expect(pinNewestFirst(items)[0]?.key).toBe("product");
  });
});

describe("home refresh pending", () => {
  it("remembers a Home tap until the feed consumes it", () => {
    markHomeRefreshPending();
    expect(consumeHomeRefreshPending()).toBe(true);
    expect(consumeHomeRefreshPending()).toBe(false);
  });
});
