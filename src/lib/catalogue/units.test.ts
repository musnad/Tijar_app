import { describe, expect, it } from "vitest";

import { formatPricePerUnit, lineTotal, normalizeQty } from "./units";

describe("per-yard pricing", () => {
  it("charges 3 yards as 3 times the yard price", () => {
    expect(lineTotal(2500, 3)).toBe(7500);
    expect(lineTotal(2500, 3.5)).toBe(8750);
  });

  it("shows the price as per yard", () => {
    expect(formatPricePerUnit(2500, "yard", (n) => `₦${n}`)).toBe("₦2500 / yard");
  });

  it("allows half yards", () => {
    expect(normalizeQty(3.2, "yard")).toBe(3);
    expect(normalizeQty(3.4, "yard")).toBe(3.5);
    expect(normalizeQty(0, "yard")).toBe(0.5);
  });
});
