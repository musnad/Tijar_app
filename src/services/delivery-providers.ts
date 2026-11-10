import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type DeliveryProvider = {
  id: string;
  name: string;
  fee: number;
  location: string | null;
  phone: string | null;
  logoUrl: string | null;
  ownShop?: boolean;
};

const COURIER_SLUGS = ["logistics", "okada", "transport"];

export async function fetchDeliveryProviders(includeShopId?: string | null): Promise<{
  providers: DeliveryProvider[];
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  const cats = await supabase.from("business_categories").select("id, slug").in("slug", COURIER_SLUGS);
  const catIds = (cats.data ?? []).map((row) => String(row.id));
  const selectCols =
    "id, business_name, delivery_fee, public_location_label, location, public_phone, logo_url, category_id, custom_category, is_published";
  const rows: Array<Record<string, unknown>> = [];

  if (catIds.length > 0) {
    const byCat = await supabase.from("businesses").select(selectCols).eq("is_published", true).in("category_id", catIds).limit(100);
    if (!byCat.error) rows.push(...((byCat.data ?? []) as Array<Record<string, unknown>>));
  }
  const byName = await supabase
    .from("businesses")
    .select(selectCols)
    .eq("is_published", true)
    .or(
      "business_name.ilike.%deliver%,business_name.ilike.%dispatch%,business_name.ilike.%logistics%,business_name.ilike.%okada%,business_name.ilike.%keke%,business_name.ilike.%courier%,custom_category.ilike.%deliver%,custom_category.ilike.%dispatch%,custom_category.ilike.%logistics%,custom_category.ilike.%rider%,custom_category.ilike.%okada%,custom_category.ilike.%courier%",
    )
    .limit(100);
  if (!byName.error) rows.push(...((byName.data ?? []) as Array<Record<string, unknown>>));
  if (rows.length === 0 && byName.error) {
    const listed = await supabase.from("businesses").select(selectCols).eq("is_published", true).limit(80);
    if (listed.error) return { providers: [], error: listed.error.message };
    rows.push(...((listed.data ?? []) as Array<Record<string, unknown>>));
  }

  const map = new Map<string, DeliveryProvider>();
  for (const row of rows) {
    const categoryMatch = catIds.includes(String(row.category_id ?? ""));
    const custom = String((row as { custom_category?: string | null }).custom_category ?? "").toLowerCase();
    const name = String(row.business_name ?? "");
    const isCourier =
      categoryMatch ||
      /deliver|dispatch|logistics|rider|okada|keke|courier/.test(`${custom} ${name.toLowerCase()}`);
    const ownShop = includeShopId && String(row.id) === includeShopId;
    if (!isCourier && !ownShop) continue;
    const fee = Number((row as { delivery_fee?: number | null }).delivery_fee ?? 0);
    map.set(String(row.id), {
      id: String(row.id),
      name: name || "Delivery",
      fee: Number.isFinite(fee) && fee > 0 ? fee : 0,
      location: (row.public_location_label as string | null) || (row.location as string | null),
      phone: (row.public_phone as string | null) ?? null,
      logoUrl: (row.logo_url as string | null) ?? null,
      ownShop: Boolean(ownShop),
    });
  }

  if (includeShopId && !map.has(includeShopId)) {
    const shop = await supabase
      .from("businesses")
      .select("id, business_name, delivery_fee, public_location_label, location, public_phone, logo_url")
      .eq("id", includeShopId)
      .maybeSingle();
    if (shop.data) {
      const fee = Number((shop.data as { delivery_fee?: number | null }).delivery_fee ?? 0);
      map.set(includeShopId, {
        id: includeShopId,
        name: `${String(shop.data.business_name ?? "This shop")} (this shop)`,
        fee: Number.isFinite(fee) && fee > 0 ? fee : 0,
        location: (shop.data.public_location_label as string | null) || (shop.data.location as string | null),
        phone: (shop.data.public_phone as string | null) ?? null,
        logoUrl: (shop.data.logo_url as string | null) ?? null,
        ownShop: true,
      });
    }
  } else if (includeShopId && map.has(includeShopId)) {
    const current = map.get(includeShopId)!;
    map.set(includeShopId, { ...current, ownShop: true, name: current.name.includes("this shop") ? current.name : `${current.name} (this shop)` });
  }

  const providers = [...map.values()].sort((a, b) => {
    if (a.ownShop && !b.ownShop) return -1;
    if (!a.ownShop && b.ownShop) return 1;
    return a.fee - b.fee;
  });
  return { providers, error: null };
}
