import { describe, expect, it } from "vitest";

import { mixFeedScore } from "@/lib/feed/feed-session";

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
});
