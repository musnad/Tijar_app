import { describe, expect, it } from "vitest";

import {
  buildSitemapXml,
  productSeoTitle,
  shopJsonLd,
  shopPageUrl,
  shopSeoDescription,
  shopSeoTitle,
} from "@/lib/seo/public-shop";
import type { PublicBusiness, PublicProduct } from "@/types/database";

const shop: PublicBusiness = {
  id: "1",
  slug: "musnad-market",
  business_name: "Musnad Market",
  description: "Fresh produce from Kano market.",
  location_text: "Kano",
  public_location_label: "Kano, Nigeria",
  latitude: 12.0,
  longitude: 8.5,
  logo_url: "https://cdn.example/logo.png",
  category_id: null,
  category_name: "Groceries",
  public_phone: "08012345678",
  public_whatsapp: null,
  opening_hours: {},
  is_verified: true,
  verification_status: "verified",
};

const product = {
  id: "p1",
  business_id: "1",
  name: "Tomatoes",
  kind: "product",
  description: null,
  sale_price: 2500,
  unit: "kg",
  image_url: null,
  is_available: true,
  business_name: "Musnad Market",
  business_slug: "musnad-market",
} as PublicProduct;

describe("public shop SEO", () => {
  it("builds a unique shop title and description", () => {
    expect(shopSeoTitle(shop)).toContain("Musnad Market");
    expect(shopSeoTitle(shop)).toContain("Tijar.ng");
    expect(shopSeoDescription(shop, [product])).toContain("Fresh produce");
    expect(shopPageUrl(shop.slug)).toBe("https://www.tijar.ng/b/musnad-market");
  });

  it("includes Store JSON-LD with TIJAR brand", () => {
    const json = shopJsonLd(shop, [product]);
    expect(json["@type"]).toBe("Store");
    expect(json.name).toBe("Musnad Market");
    expect(JSON.stringify(json)).toContain("TIJAR");
    expect(JSON.stringify(json)).toContain("Tomatoes");
  });

  it("names products for Google", () => {
    expect(productSeoTitle(product)).toContain("Tomatoes");
    expect(productSeoTitle(product)).toContain("TIJAR");
    expect(productSeoTitle({ ...product, business_public_location_label: "Kano, Nigeria" })).toBe(
      "Tomatoes in Kano, Nigeria | Buy on TIJAR",
    );
  });

  it("writes a sitemap of shop URLs", () => {
    const xml = buildSitemapXml(["/b/musnad-market", "/shop/p/p1"]);
    expect(xml).toContain("https://www.tijar.ng/b/musnad-market");
    expect(xml).toContain("https://www.tijar.ng/shop/p/p1");
    expect(xml).toContain("<urlset");
  });
});
