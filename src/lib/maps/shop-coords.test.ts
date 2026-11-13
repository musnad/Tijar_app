import { describe, expect, it } from "vitest";

import { parseNigerianLocation } from "@/lib/nigeria-locations";
import {
  formatShopPlaceLine,
  resolveShopMapCoords,
  shopPlaceLabel,
} from "@/lib/maps/shop-coords";

describe("parseNigerianLocation", () => {
  it("reads LGA-only labels", () => {
    expect(parseNigerianLocation("Ikeja")).toEqual({ state: "Lagos", lga: "Ikeja" });
    expect(parseNigerianLocation("Kano").state).toBe("Kano");
  });

  it("reads Abuja aliases", () => {
    expect(parseNigerianLocation("Abuja").state).toBe("FCT - Abuja");
  });
});

describe("shop place", () => {
  it("does not invent Lagos when a shop has no location", () => {
    expect(shopPlaceLabel({ id: "1" })).toBe("");
    expect(formatShopPlaceLine({ id: "1" })).toBe("");
  });

  it("keeps each shop's own label", () => {
    expect(shopPlaceLabel({ public_location_label: "Sabon Gari, Kano" })).toBe("Sabon Gari, Kano");
    expect(shopPlaceLabel({ location_text: "Wuse 2, Abuja" })).toBe("Wuse 2, Abuja");
  });

  it("uses saved GPS for kilometres", () => {
    const line = formatShopPlaceLine(
      {
        id: "kano-shop",
        public_location_label: "Sabon Gari, Kano",
        latitude: 12.0022,
        longitude: 8.592,
      },
      { lat: 12.0022, lng: 8.592 },
    );
    expect(line).toContain("Sabon Gari, Kano");
    expect(line).toMatch(/m$/);
    expect(line).not.toContain("Lagos");
  });

  it("does not pin unknown shops on Lagos", () => {
    expect(resolveShopMapCoords({ id: "x", location_text: "" })).toBeNull();
    const kano = resolveShopMapCoords({ id: "y", public_location_label: "Kano" }, { jitter: false });
    expect(kano?.lat).toBeCloseTo(12.0022, 2);
    expect(kano?.estimated).toBe(true);
  });
});
