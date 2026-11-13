import {
  coordinatesForState,
  formatNigerianLocation,
  parseNigerianLocation,
} from "@/lib/nigeria-locations";

import { AREA_PRESETS } from "@/lib/maps/provider";
import { formatDistance, haversineKm } from "@/utils/discover";

export type ShopMapCoords = {
  lat: number;
  lng: number;
  estimated: boolean;
};

export type ShopPlaceInput = {
  id?: string;
  latitude?: number | null;
  longitude?: number | null;
  location_text?: string | null;
  public_location_label?: string | null;
  location?: string | null;
  business_location_text?: string | null;
  business_public_location_label?: string | null;
  business_latitude?: number | null;
  business_longitude?: number | null;
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

function escapePlaceRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Deterministic ~0.8–1.6 km offset so estimated city pins do not stack. */
function jitterFromId(id: string): { dlat: number; dlng: number } {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = ((h >>> 0) % 10_000) / 10_000;
  const v = ((h >>> 8) % 10_000) / 10_000;
  const angle = u * Math.PI * 2;
  const radius = 0.006 + v * 0.01;
  return { dlat: Math.sin(angle) * radius, dlng: Math.cos(angle) * radius };
}

function rawPlaceText(shop: ShopPlaceInput): string {
  return (
    [
      shop.public_location_label,
      shop.location_text,
      shop.location,
      shop.business_public_location_label,
      shop.business_location_text,
    ]
      .map((s) => s?.trim() ?? "")
      .find(Boolean) ?? ""
  );
}

function matchCityPreset(hay: string): { lat: number; lng: number } | null {
  if (!hay.trim()) return null;
  const cities = [...AREA_PRESETS].sort((a, b) => b.name.length - a.name.length);
  for (const city of cities) {
    if (new RegExp(`\\b${escapePlaceRe(city.name)}\\b`, "i").test(hay)) return city;
  }
  return null;
}

/**
 * Pin a shop on the map from saved GPS, or from its Nigerian city/state label
 * when the owner has not dropped a pin yet. Never falls back to Lagos.
 */
export function resolveShopMapCoords(
  shop: ShopPlaceInput,
  opts?: { jitter?: boolean },
): ShopMapCoords | null {
  const lat = shop.latitude ?? shop.business_latitude;
  const lng = shop.longitude ?? shop.business_longitude;
  if (hasRealCoords(lat, lng)) {
    return { lat, lng: lng as number, estimated: false };
  }

  const hay = rawPlaceText(shop);
  const parsed = parseNigerianLocation(hay);
  const state = coordinatesForState(parsed.state);
  const city = matchCityPreset(hay);
  const base = state ?? city;
  if (!base) return null;

  if (opts?.jitter === false) return { lat: base.lat, lng: base.lng, estimated: true };

  const j = jitterFromId(shop.id ?? (hay || "shop"));
  return { lat: base.lat + j.dlat, lng: base.lng + j.dlng, estimated: true };
}

/** The shop's own written place — never a Lagos (or any city) default. */
export function shopPlaceLabel(shop: ShopPlaceInput): string {
  const raw = rawPlaceText(shop);
  if (raw && !/^nigeria$/i.test(raw)) return raw;
  const parsed = parseNigerianLocation(raw);
  return formatNigerianLocation(parsed.state, parsed.lga);
}

export function shopDistanceFromViewer(
  shop: ShopPlaceInput,
  viewer: { lat: number; lng: number } | null | undefined,
): { km: number; estimated: boolean } | null {
  if (!viewer) return null;
  const coords = resolveShopMapCoords(shop, { jitter: false });
  if (!coords) return null;
  return { km: haversineKm(viewer, coords), estimated: coords.estimated };
}

export function formatShopPlaceLine(
  shop: ShopPlaceInput,
  viewer?: { lat: number; lng: number } | null,
): string {
  const place = shopPlaceLabel(shop);
  const dist = shopDistanceFromViewer(shop, viewer);
  const km = dist
    ? `${dist.estimated ? "~ " : ""}${formatDistance(dist.km)}`.trim()
    : "";
  return [place, km].filter(Boolean).join(" · ");
}
