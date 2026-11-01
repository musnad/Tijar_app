/**
 * Maps provider adapter.
 *
 * Default provider: OpenStreetMap (no API key). Used for:
 * - Owner geocoding (Nominatim)
 * - Embedded nearby marketplace map tiles (Leaflet)
 * - External "Directions" links
 *
 * To switch providers (e.g. Google Maps), implement this interface and set
 * VITE_MAP_PROVIDER=google + VITE_GOOGLE_MAPS_API_KEY (browser key must be
 * HTTP-referrer restricted in Google Cloud Console). Server-only keys must
 * never use the VITE_ prefix.
 */

export type MapProviderId = "osm" | "google";

export interface GeocodeResult {
  lat: number;
  lng: number;
  label: string;
}

export interface MapsProvider {
  id: MapProviderId;
  attribution: string;
  tileUrlTemplate: string;
  tileSubdomains?: string[];
  /** Free-text place search. Returns owner-reviewable candidates only — never auto-saved. */
  geocode(query: string): Promise<GeocodeResult[]>;
  directionsUrl(dest: { lat: number; lng: number; label?: string }): string;
}

const osmProvider: MapsProvider = {
  id: "osm",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  tileUrlTemplate: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  async geocode(query: string) {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=ng&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const rows = (await res.json()) as { lat: string; lon: string; display_name: string }[];
    return rows.map((r) => ({
      lat: Number.parseFloat(r.lat),
      lng: Number.parseFloat(r.lon),
      label: r.display_name,
    }));
  },
  directionsUrl(dest) {
    return `https://www.openstreetmap.org/directions?to=${dest.lat}%2C${dest.lng}`;
  },
};

export function getMapsProvider(): MapsProvider {
  // Only OSM is implemented; unknown values fall back to OSM deliberately.
  return osmProvider;
}

/**
 * Turn raw GPS coordinates into a human place name ("Kano", "Wuse, Abuja").
 * Best-effort: returns null when reverse geocoding is unavailable.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=12&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      address?: Record<string, string>;
      display_name?: string;
    };
    const a = data.address ?? {};
    const city = a["city"] ?? a["town"] ?? a["village"] ?? a["county"] ?? a["state_district"] ?? a["state"];
    const area = a["suburb"] ?? a["neighbourhood"] ?? a["city_district"];
    if (area && city && area !== city) return `${area}, ${city}`;
    if (city) return city;
    return data.display_name?.split(",").slice(0, 2).join(",").trim() ?? null;
  } catch {
    return null;
  }
}

/** Manual area presets for when geolocation is denied/unavailable (Nigeria-first). */
export const AREA_PRESETS: { name: string; lat: number; lng: number }[] = [
  { name: "Kano", lat: 12.0022, lng: 8.592 },
  { name: "Lagos", lat: 6.5244, lng: 3.3792 },
  { name: "Abuja", lat: 9.0765, lng: 7.3986 },
  { name: "Kaduna", lat: 10.5105, lng: 7.4165 },
  { name: "Port Harcourt", lat: 5.0159, lng: 6.975 },
  { name: "Ibadan", lat: 7.3775, lng: 3.947 },
  { name: "Benin City", lat: 6.335, lng: 5.603 },
  { name: "Maiduguri", lat: 11.8333, lng: 13.15 },
];
