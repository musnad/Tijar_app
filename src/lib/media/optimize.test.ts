import { afterEach, describe, expect, it } from "vitest";

import {
  imageSizesFor,
  markOptimizedImageFailed,
  optimizedImageSrcSet,
  optimizedImageUrl,
  resetOptimizedImageFailures,
} from "./optimize";

const PUBLIC =
  "https://ongsfahnfknqelyhuxrt.supabase.co/storage/v1/object/public/product-images/shop/a.jpg";

afterEach(() => {
  resetOptimizedImageFailures();
});

describe("optimizedImageUrl", () => {
  it("rewrites public storage objects to the render endpoint", () => {
    const out = optimizedImageUrl(PUBLIC, 540);
    expect(out).toContain("/storage/v1/render/image/public/product-images/shop/a.jpg");
    expect(out).toContain("width=540");
    expect(out).toContain("quality=68");
  });

  it("rewrites signed objects and keeps the token", () => {
    const signed =
      "https://x.supabase.co/storage/v1/object/sign/product-images/a.jpg?token=abc";
    const out = optimizedImageUrl(signed, 200);
    expect(out).toContain("/storage/v1/render/image/sign/product-images/a.jpg");
    expect(out).toContain("token=abc");
    expect(out).toContain("width=200");
  });

  it("leaves data URLs and local paths alone", () => {
    expect(optimizedImageUrl("data:image/png;base64,xx", 200)).toBe("data:image/png;base64,xx");
    expect(optimizedImageUrl("/tijar-logo.png", 200)).toBe("/tijar-logo.png");
  });

  it("stops using render after repeated failures", () => {
    markOptimizedImageFailed();
    markOptimizedImageFailed();
    expect(optimizedImageUrl(PUBLIC, 540)).toBe(PUBLIC);
  });
});

describe("optimizedImageSrcSet", () => {
  it("lists a few widths", () => {
    const set = optimizedImageSrcSet(PUBLIC, 540);
    expect(set).toContain("378w");
    expect(set).toContain("540w");
    expect(set).toContain("756w");
  });
});

describe("imageSizesFor", () => {
  it("uses pixels for thumbs and viewport for feed", () => {
    expect(imageSizesFor(96)).toBe("96px");
    expect(imageSizesFor(540)).toContain("100vw");
  });
});
