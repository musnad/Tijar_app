import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("robots.txt", () => {
  const robots = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../../public/robots.txt"), "utf8");

  it("allows public discovery URLs and blocks private app surfaces", () => {
    expect(robots).toContain("Allow: /b/");
    expect(robots).toContain("Allow: /vendor/");
    expect(robots).toContain("Allow: /nigeria/");
    expect(robots).toContain("Disallow: /app/");
    expect(robots).toContain("Disallow: /api/");
    expect(robots).toContain("Disallow: /login");
    expect(robots).toContain("Sitemap: https://www.tijar.ng/sitemap.xml");
  });
});
