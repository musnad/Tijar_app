import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { slugifyBusinessName } from "@/utils/discover";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isBlankShopName(name?: string | null): boolean {
  const n = name?.trim() ?? "";
  return !n || /^tijar(\s+shop)?$/i.test(n);
}

export function displayShopName(name?: string | null, personName?: string | null): string {
  if (!isBlankShopName(name)) return name!.trim();
  if (personName?.trim()) return personName.trim();
  return "Shop";
}

export function shopLinkSlug(slug?: string | null, businessId?: string | null): string {
  return slug?.trim() || businessId?.trim() || "";
}

/** Public @username: business name, never a raw UUID. */
export function shopUsername(name?: string | null, slug?: string | null): string {
  const raw = slug?.trim().replace(/^@/, "") ?? "";
  if (raw && !UUID_RE.test(raw)) return raw.toLowerCase();
  return slugifyBusinessName(name ?? "") || "shop";
}

export function usernameMatchesName(name?: string | null, handle?: string | null): boolean {
  const a = slugifyBusinessName(name ?? "");
  const b = slugifyBusinessName((handle ?? "").replace(/^@/, ""));
  return Boolean(a) && a === b;
}

function mergeShopRow(map: Map<string, ShopNameRow>, row: ShopNameRow) {
  const existing = map.get(row.id);
  if (!existing) {
    map.set(row.id, row);
    return;
  }
  const preferNewName = isBlankShopName(existing.business_name) && !isBlankShopName(row.business_name);
  map.set(row.id, {
    ...existing,
    business_name: preferNewName ? row.business_name : existing.business_name,
    slug: existing.slug?.trim() || row.slug,
    logo_url: existing.logo_url || row.logo_url,
    latitude: existing.latitude ?? row.latitude,
    longitude: existing.longitude ?? row.longitude,
    location_text: existing.location_text || row.location_text,
    public_location_label: existing.public_location_label || row.public_location_label,
    is_verified: existing.is_verified || row.is_verified,
    verification_status: existing.verification_status ?? row.verification_status,
    category_id: existing.category_id ?? row.category_id,
    category_name: existing.category_name ?? row.category_name,
  });
}

export type ShopNameRow = {
  id: string;
  business_name: string;
  slug?: string | null;
  logo_url?: string | null;
  is_verified?: boolean;
  verification_status?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_text?: string | null;
  public_location_label?: string | null;
};

export async function lookupShopProfiles(ids: string[]): Promise<Map<string, ShopNameRow>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, ShopNameRow>();
  if (unique.length === 0) return map;

  const supabase = getSupabaseBrowserClient();
  const publicRows = await supabase
    .from("public_marketplace_businesses")
    .select("id, slug, business_name, logo_url, is_verified, verification_status, category_id, category_name, latitude, longitude, location_text, public_location_label")
    .in("id", unique);
  for (const row of publicRows.data ?? []) {
    mergeShopRow(map, {
      id: row.id as string,
      business_name: (row.business_name as string) ?? "",
      slug: (row.slug as string | null) ?? null,
      logo_url: (row.logo_url as string | null) ?? null,
      is_verified: Boolean(row.is_verified),
      verification_status: (row.verification_status as string | null) ?? null,
      category_id: (row.category_id as string | null) ?? null,
      category_name: (row.category_name as string | null) ?? null,
      latitude: row.latitude != null ? Number(row.latitude) : null,
      longitude: row.longitude != null ? Number(row.longitude) : null,
      location_text: (row.location_text as string | null) ?? null,
      public_location_label: (row.public_location_label as string | null) ?? null,
    });
  }

  const missing = unique.filter(
    (id) => !map.has(id) || isBlankShopName(map.get(id)?.business_name) || !map.get(id)?.slug?.trim(),
  );
  if (missing.length === 0) return map;

  const listings = await supabase
    .from("public_business_listings")
    .select("id, slug, business_name, logo_url, is_verified, verification_status, category_id, category_name, latitude, longitude, location_text, public_location_label")
    .in("id", missing);
  for (const row of listings.data ?? []) {
    mergeShopRow(map, {
      id: row.id as string,
      business_name: (row.business_name as string) ?? "",
      slug: (row.slug as string | null) ?? null,
      logo_url: (row.logo_url as string | null) ?? null,
      is_verified: Boolean(row.is_verified),
      verification_status: (row.verification_status as string | null) ?? null,
      category_id: (row.category_id as string | null) ?? null,
      category_name: (row.category_name as string | null) ?? null,
      latitude: row.latitude != null ? Number(row.latitude) : null,
      longitude: row.longitude != null ? Number(row.longitude) : null,
      location_text: (row.location_text as string | null) ?? null,
      public_location_label: (row.public_location_label as string | null) ?? null,
    });
  }

  const still = unique.filter(
    (id) => !map.has(id) || isBlankShopName(map.get(id)?.business_name) || !map.get(id)?.slug?.trim(),
  );
  if (still.length > 0) {
    const owned = await supabase.from("businesses").select("id, public_slug, business_name, logo_url, verification_status, category_id, latitude, longitude, location, public_location_label").in("id", still);
    for (const row of owned.data ?? []) {
      mergeShopRow(map, {
        id: row.id as string,
        business_name: (row.business_name as string) ?? "",
        slug: (row.public_slug as string | null) ?? null,
        logo_url: (row.logo_url as string | null) ?? null,
        verification_status: (row.verification_status as string | null) ?? null,
        category_id: (row.category_id as string | null) ?? null,
        latitude: row.latitude != null ? Number(row.latitude) : null,
        longitude: row.longitude != null ? Number(row.longitude) : null,
        location_text: (row.location as string | null) ?? null,
        public_location_label: (row.public_location_label as string | null) ?? null,
      });
    }
  }

  let unnamed = unique.filter((id) => isBlankShopName(map.get(id)?.business_name));
  if (unnamed.length > 0) {
    const products = await supabase
      .from("public_business_products")
      .select("business_id, business_name, business_slug, business_logo_url")
      .in("business_id", unnamed)
      .limit(400);
    for (const row of products.data ?? []) {
      if (isBlankShopName(row.business_name as string | null)) continue;
      const id = row.business_id as string;
      const current = map.get(id);
      mergeShopRow(map, {
        id,
        business_name: row.business_name as string,
        slug: (row.business_slug as string | null) ?? current?.slug ?? null,
        logo_url: (row.business_logo_url as string | null) ?? current?.logo_url ?? null,
        verification_status: current?.verification_status ?? null,
        category_id: current?.category_id ?? null,
        category_name: current?.category_name ?? null,
      });
    }
  }

  unnamed = unique.filter((id) => isBlankShopName(map.get(id)?.business_name));
  if (unnamed.length > 0) {
    const owners = await supabase.from("businesses").select("id, owner_id").in("id", unnamed);
    const ownerIds = [...new Set((owners.data ?? []).map((r) => r.owner_id as string).filter(Boolean))];
    if (ownerIds.length > 0) {
      const profiles = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ownerIds);
      const nameByOwner = new Map((profiles.data ?? []).map((p) => [p.id as string, (p.full_name as string | null) ?? ""]));
      const photoByOwner = new Map(
        (profiles.data ?? []).map((p) => [p.id as string, (p.avatar_url as string | null) ?? ""]),
      );
      for (const row of owners.data ?? []) {
        const person = nameByOwner.get(row.owner_id as string)?.trim();
        const photo = photoByOwner.get(row.owner_id as string)?.trim() || null;
        if (!person && !photo) continue;
        const current = map.get(row.id as string);
        mergeShopRow(map, {
          id: row.id as string,
          business_name: person || current?.business_name || "",
          slug: current?.slug ?? null,
          logo_url: current?.logo_url || photo,
          verification_status: current?.verification_status ?? null,
          category_id: current?.category_id ?? null,
          category_name: current?.category_name ?? null,
        });
      }
    }
  }

  const needLogo = unique.filter((id) => !map.get(id)?.logo_url);
  if (needLogo.length > 0) {
    const owned = await supabase.from("businesses").select("id, logo_url, owner_id").in("id", needLogo);
    const ownerIds = [...new Set((owned.data ?? []).map((r) => r.owner_id as string).filter(Boolean))];
    const photos = ownerIds.length
      ? await supabase.from("profiles").select("id, avatar_url").in("id", ownerIds)
      : { data: [] as Array<{ id: string; avatar_url: string | null }> };
    const photoByOwner = new Map(
      (photos.data ?? []).map((p) => [p.id as string, ((p.avatar_url as string | null) ?? "").trim()]),
    );
    for (const row of owned.data ?? []) {
      const photo = ((row.logo_url as string | null) ?? "").trim() || photoByOwner.get(row.owner_id as string) || null;
      if (!photo) continue;
      const current = map.get(row.id as string);
      mergeShopRow(map, {
        id: row.id as string,
        business_name: current?.business_name ?? "",
        slug: current?.slug ?? null,
        logo_url: photo,
        is_verified: current?.is_verified,
        verification_status: current?.verification_status ?? null,
        category_id: current?.category_id ?? null,
        category_name: current?.category_name ?? null,
      });
    }
  }

  return map;
}

export async function lookupProfileNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.from("profiles").select("id, full_name").in("id", unique);
  for (const row of data ?? []) {
    const name = (row.full_name as string | null)?.trim();
    if (name) map.set(row.id as string, name);
  }
  return map;
}

export async function lookupProfilePhotos(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.from("profiles").select("id, avatar_url").in("id", unique);
  for (const row of data ?? []) {
    const photo = (row.avatar_url as string | null)?.trim();
    if (photo) map.set(row.id as string, photo);
  }
  return map;
}
