import { describe, expect, it } from "vitest";

import { canPublishProduct, productPublishErrors } from "./publish-guard";

describe("productPublishErrors", () => {
  it("requires a name, a price and at least one photo", () => {
    expect(productPublishErrors({ name: "", sale_price: null })).toEqual(
      expect.arrayContaining(["Add a product name.", "Add a price.", "Add at least one product photo."]),
    );
    expect(
      canPublishProduct({
        name: "Rice",
        sale_price: 1000,
        image_url: "https://example.com/rice.jpg",
        is_active: true,
      }),
    ).toBe(true);
  });
});
