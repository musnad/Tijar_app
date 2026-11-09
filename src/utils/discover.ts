/** Pure discovery logic — framework-free so it is fully unit-testable. */

export type ListingVisibilityInput = {
  is_published?: boolean | null;
  moderation_status?: string | null;
  location_approved?: boolean | null;
  latitude?: number | null;
  longitude?: number | null;
  public_slug?: string | null;
};

/** The single public-visibility rule, mirrored in the SQL view. */
export function isListingVisible(b: ListingVisibilityInput): boolean {
  return Boolean(
    b.is_published &&
      b.moderation_status === "approved" &&
      b.location_approved &&
      typeof b.latitude === "number" &&
      typeof b.longitude === "number" &&
      b.public_slug,
  );
}

export function isValidCoordinates(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

export function slugifyBusinessName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && slug.length >= 2 && slug.length <= 60;
}

const EARTH_RADIUS_KM = 6371;

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function formatDistance(km: number | null | undefined): string {
  if (km === null || km === undefined || !Number.isFinite(km)) return "";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

export type DiscoverListing = {
  id: string;
  slug: string;
  business_name: string;
  description: string | null;
  category_id: string | null;
  category_name: string | null;
  latitude: number;
  longitude: number;
  is_verified: boolean;
  distance_km?: number | null;
  product_names?: string[];
};

export type DiscoverFilters = {
  query?: string;
  categoryId?: string | null;
  /** Centre for distance calc/filter. Null = no distance filtering (manual area / denied permission). */
  centre?: { lat: number; lng: number } | null;
  radiusKm?: number | null;
  verifiedOnly?: boolean;
};

function matchesQuery(listing: DiscoverListing, q: string): boolean {
  if (!q) return true;
  const haystack = [
    listing.business_name,
    listing.slug,
    listing.description ?? "",
    listing.category_name ?? "",
    listing.slug.replace(/-/g, ""),
    `@${listing.slug.replace(/^@/, "")}`,
    ...(listing.product_names ?? []),
  ]
    .join(" ")
    .toLowerCase();
  const needle = q.trim().replace(/^@+/, "").toLowerCase();
  return needle.split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
}

/** Search + filter + distance-sort. Pure; used for list and map pins alike. */
export function filterListings<T extends DiscoverListing>(
  listings: T[],
  filters: DiscoverFilters,
): (T & { distance_km: number | null })[] {
  const withDistance = listings.map((l) => ({
    ...l,
    distance_km: filters.centre
      ? haversineKm(filters.centre, { lat: l.latitude, lng: l.longitude })
      : (l.distance_km ?? null),
  }));

  const filtered = withDistance.filter((l) => {
    if (!matchesQuery(l, filters.query?.trim() ?? "")) return false;
    if (filters.categoryId && l.category_id !== filters.categoryId) return false;
    if (filters.verifiedOnly && !l.is_verified) return false;
    if (
      filters.centre &&
      filters.radiusKm &&
      (l.distance_km === null || l.distance_km > filters.radiusKm)
    ) {
      return false;
    }
    return true;
  });

  if (filters.centre) {
    filtered.sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));
  }
  return filtered;
}

/** Listing completeness for owner prompts + admin review (0–100). */
export function listingCompleteness(input: {
  business_name?: string | null;
  description?: string | null;
  public_slug?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_approved?: boolean | null;
  public_phone?: string | null;
  public_whatsapp?: string | null;
  logo_url?: string | null;
  productCount?: number;
}): { score: number; missing: string[] } {
  const checks: [boolean, string][] = [
    [Boolean(input.business_name?.trim()), "business name"],
    [Boolean(input.description?.trim()), "description"],
    [Boolean(input.public_slug && isValidSlug(input.public_slug)), "storefront URL"],
    [isValidCoordinates(input.latitude, input.longitude), "map location"],
    [Boolean(input.location_approved), "public location approval"],
    [Boolean(input.public_phone || input.public_whatsapp), "contact phone or WhatsApp"],
    [Boolean(input.logo_url), "logo"],
    [(input.productCount ?? 0) > 0, "at least one product or service"],
  ];
  const missing = checks.filter(([ok]) => !ok).map(([, label]) => label);
  return { score: Math.round(((checks.length - missing.length) / checks.length) * 100), missing };
}

/** Flag probable duplicates: same/similar name within ~250 m, or shared public phone. */
export function detectDuplicates<
  T extends { id: string; business_name: string; latitude?: number | null; longitude?: number | null; public_phone?: string | null },
>(listings: T[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  for (let i = 0; i < listings.length; i++) {
    for (let j = i + 1; j < listings.length; j++) {
      const a = listings[i]!;
      const b = listings[j]!;
      const reasons: string[] = [];
      const sameName = norm(a.business_name) === norm(b.business_name);
      const near =
        isValidCoordinates(a.latitude, a.longitude) &&
        isValidCoordinates(b.latitude, b.longitude) &&
        haversineKm(
          { lat: a.latitude as number, lng: a.longitude as number },
          { lat: b.latitude as number, lng: b.longitude as number },
        ) < 0.25;
      if (sameName && near) reasons.push("same name within 250 m");
      if (a.public_phone && b.public_phone && a.public_phone === b.public_phone) {
        reasons.push("same public phone");
      }
      if (reasons.length) {
        result.set(a.id, [...(result.get(a.id) ?? []), `${b.business_name}: ${reasons.join(", ")}`]);
        result.set(b.id, [...(result.get(b.id) ?? []), `${a.business_name}: ${reasons.join(", ")}`]);
      }
    }
  }
  return result;
}
