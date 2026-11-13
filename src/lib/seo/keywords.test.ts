import { describe, expect, it } from "vitest";

import {
  findKeyword,
  haystackMatchesKeyword,
  locationPageTitle,
  mergeKeywordLists,
} from "@/lib/seo/keywords";
import { isPublicShopIndexable, seoReadinessScore } from "@/lib/seo/eligibility";
import { nigeriaPath } from "@/lib/seo/location-directory";
import { placeSlug } from "@/lib/seo/location-taxonomy";
import { buildSitemapXml, shopJsonLd, shopSeoTitle } from "@/lib/seo/public-shop";
import { breadcrumbJsonLd } from "@/lib/seo/catalog";
import type { PublicBusiness } from "@/types/database";

describe("Hausa and English keyword map", () => {
  it("maps dan wake to bean cake / street food", () => {
    const row = findKeyword("dan-wake");
    expect(row?.englishLabel).toBe("Bean cake seller");
    expect(row?.categorySlug).toBe("street-food");
    expect(haystackMatchesKeyword("Amira Dan Wake Kano", row!)).toBe(true);
  });

  it("maps mai faci to tailors", () => {
    expect(findKeyword("mai-faci")?.categorySlug).toBe("tailoring");
    expect(findKeyword("tailors")?.categorySlug).toBe("tailoring");
  });

  it("does not invent unrelated associations", () => {
    expect(findKeyword("kosai")).toBeNull();
    expect(mergeKeywordLists().every((row) => row.categorySlug && row.englishLabel)).toBe(true);
  });

  it("writes natural titles without stuffing", () => {
    const title = locationPageTitle(findKeyword("dan-wake")!, "Kano");
    expect(title).toBe("Mai dan wake in Kano | Tijar.ng");
    expect(title.toLowerCase().split("dan wake").length).toBeLessThan(4);
  });
});

describe("public vendor eligibility", () => {
  const base: PublicBusiness = {
    id: "1",
    slug: "amina-danwake-kano",
    business_name: "Amina Dan Wake",
    description: "Dan wake stall in Kano city market.",
    location_text: "Kano",
    public_location_label: "Kano",
    latitude: null,
    longitude: null,
    logo_url: "https://cdn.example/a.png",
    category_id: null,
    category_name: "Street food & bukka",
    public_phone: "0801",
    public_whatsapp: null,
    opening_hours: {},
    is_verified: false,
    verification_status: "unverified",
  };

  it("indexes complete public profiles and skips empty ones", () => {
    expect(isPublicShopIndexable(base)).toBe(true);
    expect(isPublicShopIndexable({ ...base, business_name: "A", description: "", logo_url: null, public_location_label: "", location_text: "" })).toBe(
      false,
    );
  });

  it("excludes suspended profiles", () => {
    expect(isPublicShopIndexable({ ...base, verification_status: "suspended" })).toBe(false);
  });

  it("builds unique vendor titles and Store JSON-LD without fake ratings", () => {
    const title = shopSeoTitle(base);
    expect(title).toContain("Amina Dan Wake");
    expect(title).toContain("Kano");
    expect(title).toContain("Tijar.ng");
    const json = JSON.stringify(shopJsonLd(base, []));
    expect(json).toContain("Store");
    expect(json).not.toContain("aggregateRating");
    expect(json).not.toContain("reviewCount");
  });

  it("scores completeness only", () => {
    const ready = seoReadinessScore({
      isPublished: true,
      slug: "shop",
      description: "A".repeat(40),
      logoUrl: "x",
      location: "Kano",
      categoryName: "Food",
      publicPhone: "0801",
      productCount: 1,
    });
    expect(ready.score).toBe(100);
    expect(ready.indexable).toBe(true);
    expect(seoReadinessScore({ isPublished: false }).indexable).toBe(false);
  });
});

describe("location URLs and sitemap", () => {
  it("builds nigeria paths", () => {
    expect(placeSlug("Sabon Gari")).toBe("sabon-gari");
    expect(nigeriaPath("kano", "dan-wake")).toBe("/nigeria/kano/dan-wake");
    expect(nigeriaPath("kano", "tailors", "sabon-gari")).toBe("/nigeria/kano/sabon-gari/tailors");
  });

  it("writes sitemap loc values and omits junk", () => {
    const xml = buildSitemapXml(["/b/amina-danwake-kano", "/nigeria/kano/dan-wake"]);
    expect(xml).toContain("https://www.tijar.ng/b/amina-danwake-kano");
    expect(xml).toContain("https://www.tijar.ng/nigeria/kano/dan-wake");
    expect(xml).not.toContain("/app/");
  });

  it("emits breadcrumb JSON-LD", () => {
    const json = breadcrumbJsonLd([
      { name: "Tijar", url: "https://www.tijar.ng" },
      { name: "Kano", url: "https://www.tijar.ng/nigeria/kano" },
    ]);
    expect(json["@type"]).toBe("BreadcrumbList");
    expect(JSON.stringify(json)).toContain("Kano");
  });
});
