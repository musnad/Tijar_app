import { coordinatesForState, parseNigerianLocation } from "@/lib/nigeria-locations";

import { AREA_PRESETS } from "@/lib/maps/provider";

export type ShopMapCoords = {
  lat: number;
  lng: number;
  estimated: boolean;
};

function hasRealCoords(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

/** Deterministic ~0.8–1.6 km offset so estimated city pins do not stack. */
function jitterFromId(id: string): { dlat: number; dlng: number } {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = ((h >>> 0) % 10_000) / 10_000;
  const v = (((h >>> 8) % 10_000) / 10_000);
  const angle = u * Math.PI * 2;
  const radius = 0.006 + v * 0.01;
  return { dlat: Math.sin(angle) * radius, dlng: Math.cos(angle) * radius };
}

/**
 * Pin a shop on the map from saved GPS, or from its Nigerian city/state label
 * when the owner has not dropped a pin yet.
 */
export function resolveShopMapCoords(shop: {
  id: string;
  latitude?: number | null;
  longitude?: number | null;
  location_text?: string | null;
  public_location_label?: string | null;
}): ShopMapCoords | null {
  if (hasRealCoords(shop.latitude, shop.longitude)) {
    return { lat: shop.latitude, lng: shop.longitude as number, estimated: false };
  }

  const hay = `${shop.public_location_label ?? ""} ${shop.location_text ?? ""}`.toLowerCase();
  const city = AREA_PRESETS.find((a) => hay.includes(a.name.toLowerCase()));
  const parsed = parseNigerianLocation(shop.location_text) ?? { state: "", lga: "" };
  const fromLabel = parseNigerianLocation(shop.public_location_label);
  const state = coordinatesForState(parsed.state || fromLabel.state);
  const base = city ?? state;
  if (!base) return null;

  const j = jitterFromId(shop.id);
  return { lat: base.lat + j.dlat, lng: base.lng + j.dlng, estimated: true };
}
