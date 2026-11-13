import { describe, expect, it } from "vitest";

import {
  categoryPageUrl,
  categorySeoTitle,
  listingSeoTitle,
  organizationJsonLd,
  searchPageUrl,
  searchSeoTitle,
  websiteJsonLd,
} from "@/lib/seo/catalog";

describe("catalog SEO", () => {
  it("titles category and search pages for Google", () => {
    expect(categorySeoTitle("Groceries")).toContain("Groceries");
    expect(categorySeoTitle("Groceries")).toContain("TIJAR");
    expect(searchSeoTitle("Tomatoes")).toBe("Tomatoes for sale in Nigeria | Buy on TIJAR");
    expect(categoryPageUrl("Palm Oil")).toContain("/shop/c/");
    expect(searchPageUrl("iphone")).toBe("https://www.tijar.ng/shop/search/iphone");
  });

  it("exposes Organization and SearchAction JSON-LD", () => {
    const org = organizationJsonLd();
    const site = websiteJsonLd();
    expect(org["@type"]).toBe("Organization");
    expect(org.name).toBe("TIJAR");
    expect(site["@type"]).toBe("WebSite");
    expect(JSON.stringify(site)).toContain("/shop/search/{search_term_string}");
  });

  it("titles listings with place", () => {
    expect(
      listingSeoTitle({
        id: "1",
        title: "Jollof rice",
        details: null,
        price: 2500,
        image_urls: [],
        shop_name: "Mama Put",
        shop_slug: "mama-put",
        location_label: "Kano",
        category: "Food",
        is_open: true,
      }),
    ).toBe("Jollof rice in Kano | Order on TIJAR");
  });
});
