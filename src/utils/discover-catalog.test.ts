import { describe, expect, it } from "vitest";

import { catalogSuggestions, filterCatalogProducts, filterCatalogSellers } from "./discover-catalog";

const products = [
  {
    id: "1",
    name: "Rice 50kg",
    kind: "goods" as const,
    sale_price: 45000,
    is_available: true,
    category_name: "Foodstuff",
    business_id: "b1",
    business_name: "Aisha Foods",
    attributes: { colour: "white" },
  },
  {
    id: "2",
    name: "Agbada sewing",
    kind: "service" as const,
    sale_price: 15000,
    is_available: true,
    category_name: "Fashion",
    business_id: "b2",
    business_name: "Kano Tailor",
    attributes: { size: "L" },
  },
  {
    id: "3",
    name: "Palm oil",
    kind: "goods" as const,
    sale_price: 8000,
    is_available: false,
    category_name: "Foodstuff",
    business_id: "b1",
    business_name: "Aisha Foods",
  },
];

describe("filterCatalogProducts", () => {
  it("filters by kind, availability, price and query", () => {
    expect(filterCatalogProducts(products, { kind: "goods", availableOnly: true })).toHaveLength(1);
    expect(filterCatalogProducts(products, { minPrice: 10000, maxPrice: 20000 }).map((p) => p.id)).toEqual(["2"]);
    expect(filterCatalogProducts(products, { query: "rice aisha" }).map((p) => p.id)).toEqual(["1"]);
    expect(
      filterCatalogProducts(
        [
          ...products,
          {
            id: "4",
            name: "Stick meat",
            kind: "goods" as const,
            sale_price: 500,
            is_available: true,
            category_name: null,
            business_id: "b3",
            business_name: "Night Suya",
            business_slug: "night-suya",
          },
        ],
        { query: "@night-suya", category: "Foodstuff" },
      ).map((p) => p.id),
    ).toEqual(["4"]);
    expect(filterCatalogProducts(products, { attribute: "L" }).map((p) => p.id)).toEqual(["2"]);
  });
});

describe("filterCatalogSellers", () => {
  it("matches seller name, category, location and product names", () => {
    const sellers = [
      {
        id: "b1",
        slug: "aisha",
        business_name: "Aisha Foods",
        category_id: "c1",
        category_name: "Foodstuff",
        product_names: ["Rice 50kg"],
        location_text: "Sabon Gari, Kano",
        public_location_label: "Sabon Gari market",
      },
      { id: "b2", slug: "tailor", business_name: "Kano Tailor", category_id: "c2", product_names: ["Agbada"] },
    ];
    expect(filterCatalogSellers(sellers, "rice").map((s) => s.id)).toEqual(["b1"]);
    expect(filterCatalogSellers(sellers, "sabon gari").map((s) => s.id)).toEqual(["b1"]);
    expect(filterCatalogSellers(sellers, "foodstuff").map((s) => s.id)).toEqual(["b1"]);
    expect(filterCatalogSellers(sellers, "", "c2").map((s) => s.id)).toEqual(["b2"]);
  });

  it("finds shops by username and informal food words even with no category", () => {
    const sellers = [
      {
        id: "suya-1",
        slug: "musab-grill",
        business_name: "Musab Grill",
        description: "Hot tsire by the road",
        category_id: null,
        category_name: null,
        product_names: [],
      },
      { id: "b2", slug: "tailor", business_name: "Kano Tailor", category_id: "c2", product_names: ["Agbada"] },
    ];
    expect(filterCatalogSellers(sellers, "@musab-grill").map((s) => s.id)).toEqual(["suya-1"]);
    expect(filterCatalogSellers(sellers, "suya").map((s) => s.id)).toEqual(["suya-1"]);
    expect(filterCatalogSellers(sellers, "tsire").map((s) => s.id)).toEqual(["suya-1"]);
    expect(filterCatalogSellers(sellers, "suya", "c2").map((s) => s.id)).toEqual(["suya-1"]);
  });
});

describe("catalogSuggestions", () => {
  it("returns suggestions only from real catalogue rows", () => {
    const s = catalogSuggestions({
      query: "ri",
      products,
      sellers: [{ id: "b1", slug: "aisha", business_name: "Aisha Foods" }],
      categories: ["Foodstuff", "Fashion"],
    });
    expect(s.some((x) => x.label === "Rice 50kg" && x.kind === "product")).toBe(true);
    expect(s.every((x) => ["product", "service", "seller", "category"].includes(x.kind))).toBe(true);
  });
});
