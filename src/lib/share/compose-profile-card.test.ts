import { describe, expect, it } from "vitest";

import { profileShareCaption } from "@/lib/share/compose-profile-card";

describe("profile share caption", () => {
  it("brands TIJAR and includes handle plus link", () => {
    const text = profileShareCaption({
      name: "Musnad",
      handle: "the_musnad",
      url: "https://www.tijar.ng/shop/u/abc",
    });
    expect(text).toContain("TIJAR");
    expect(text).toContain("@the_musnad");
    expect(text).toContain("tijar.ng");
    expect(text).toContain("https://www.tijar.ng/shop/u/abc");
  });
});
