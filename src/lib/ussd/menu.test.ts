import { describe, expect, it } from "vitest";

import { formatUssdBody, ussdMenu } from "./menu";

describe("ussdMenu", () => {
  it("starts with the home menu", () => {
    const screen = ussdMenu({ text: "" });
    expect(screen.continue).toBe(true);
    expect(screen.message).toMatch(/Open a shop/);
    expect(formatUssdBody(screen).startsWith("CON ")).toBe(true);
  });

  it("asks for a shop name after 1", () => {
    expect(ussdMenu({ text: "1" }).hop).toBe("name");
  });

  it("walks name, category, location, then creates", () => {
    expect(ussdMenu({ text: "1*Mama Ngozi" }).hop).toBe("category");
    expect(ussdMenu({ text: "1*Mama Ngozi*1" }).hop).toBe("location");
    expect(ussdMenu({ text: "1*Mama Ngozi*1*Kano" }).hop).toBe("confirm");
    const done = ussdMenu({ text: "1*Mama Ngozi*1*Kano*1" });
    expect(done.create?.shopName).toBe("Mama Ngozi");
    expect(done.create?.categorySlug).toBe("street-food");
    expect(done.create?.location).toBe("Kano");
  });

  it("returns an existing shop", () => {
    const screen = ussdMenu({ text: "2", existingShopUrl: "tijar.ng/b/mama-ngozi" });
    expect(screen.continue).toBe(false);
    expect(screen.message).toContain("tijar.ng/b/mama-ngozi");
  });
});
