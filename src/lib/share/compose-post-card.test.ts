import { describe, expect, it } from "vitest";

import { postShareCaption } from "@/lib/share/compose-post-card";

describe("post share caption", () => {
  it("includes product details, TIJAR brand, and the order link", () => {
    const text = postShareCaption({
      title: "Fresh tomatoes",
      shopName: "Musnad Market",
      handle: "musnad_market",
      caption: "Harvest this morning",
      priceLabel: "₦2,500",
      url: "https://www.tijar.ng/shop/p/abc",
    });
    expect(text).toContain("Fresh tomatoes");
    expect(text).toContain("Musnad Market");
    expect(text).toContain("TIJAR");
    expect(text).toContain("@musnad_market");
    expect(text).toContain("₦2,500");
    expect(text).toContain("tijar.ng");
    expect(text).toContain("https://www.tijar.ng/shop/p/abc");
  });
});
