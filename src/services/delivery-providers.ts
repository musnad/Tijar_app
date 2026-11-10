import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type DeliveryProvider = {
  id: string;
  offerId: string;
  name: string;
  offerTitle: string;
  source: "place_order" | "product";
  fee: number;
  location: string | null;
  phone: string | null;
  logoUrl: string | null;
};

const COURIER_SLUGS = ["logistics"];
const COURIER_TEXT = /dispatch|deliver|logistics|courier/;

function money(n: unknown): number {
  const v = Number(n ?? 0);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

function isCourierText(...parts: Array<string | null | undefined>): boolean {
  return COURIER_TEXT.test(parts.map((p) => String(p ?? "").toLowerCase()).join(" "));
}

/** Place-order: use the post's delivery fee when set, otherwise the listing price (the trip itself). */
function feeFromPlaceOrder(price: unknown, deliveryFee: unknown): number {
  const extra = money(deliveryFee);
  if (extra > 0) return extra;
  return money(price);
}

export async function fetchDeliveryProviders(): Promise<{
  providers: DeliveryProvider[];
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  const cats = await supabase.from("business_categories").select("id, slug").in("slug", COURIER_SLUGS);
  const catIds = (cats.data ?? []).map((row) => String(row.id));
  const selectCols =
    "id, business_name, public_location_label, location, public_phone, logo_url, category_id, custom_category, is_published";
  const rows: Array<Record<string, unknown>> = [];

  if (catIds.length > 0) {
    const byCat = await supabase.from("businesses").select(selectCols).eq("is_published", true).in("category_id", catIds).limit(100);
    if (!byCat.error) rows.push(...((byCat.data ?? []) as Array<Record<string, unknown>>));
  }

  const byCustom = await supabase
    .from("businesses")
    .select(selectCols)
    .eq("is_published", true)
    .or(
      "custom_category.ilike.%dispatch%,custom_category.ilike.%deliver%,custom_category.ilike.%logistics%,custom_category.ilike.%courier%",
    )
    .limit(100);
  if (!byCustom.error) rows.push(...((byCustom.data ?? []) as Array<Record<string, unknown>>));

  const shops = new Map<
    string,
    { id: string; name: string; location: string | null; phone: string | null; logoUrl: string | null }
  >();
  for (const row of rows) {
    const id = String(row.id ?? "");
    if (!id) continue;
    const categoryMatch = catIds.includes(String(row.category_id ?? ""));
    const custom = String(row.custom_category ?? "");
    if (!categoryMatch && !isCourierText(custom)) continue;
    shops.set(id, {
      id,
      name: String(row.business_name ?? "Delivery") || "Delivery",
      location: (row.public_location_label as string | null) || (row.location as string | null),
      phone: (row.public_phone as string | null) ?? null,
      logoUrl: (row.logo_url as string | null) ?? null,
    });
  }

  const ids = [...shops.keys()];
  if (ids.length === 0) return { providers: [], error: null };

  const providers: DeliveryProvider[] = [];

  const listings = await supabase
    .from("place_order_listings")
    .select("id, business_id, title, price, delivery_fee, location_label, is_open, created_at")
    .in("business_id", ids)
    .eq("is_open", true)
    .order("created_at", { ascending: false })
    .limit(200);
  if (!listings.error) {
    for (const row of listings.data ?? []) {
      const shop = shops.get(String(row.business_id));
      const fee = feeFromPlaceOrder(row.price, row.delivery_fee);
      if (!shop || fee <= 0) continue;
      providers.push({
        id: shop.id,
        offerId: `place:${row.id}`,
        name: shop.name,
        offerTitle: String(row.title ?? "Place your order").trim() || "Place your order",
        source: "place_order",
        fee,
        location: (row.location_label as string | null) || shop.location,
        phone: shop.phone,
        logoUrl: shop.logoUrl,
      });
    }
  }

  let products = await supabase
    .from("products")
    .select("id, business_id, name, sale_price, image_url, is_active, is_published")
    .in("business_id", ids)
    .gt("sale_price", 0)
    .limit(200);
  if (products.error && /is_published|is_active/i.test(products.error.message)) {
    products = await supabase
      .from("products")
      .select("id, business_id, name, sale_price, image_url")
      .in("business_id", ids)
      .gt("sale_price", 0)
      .limit(200);
  }
  if (!products.error) {
    for (const row of products.data ?? []) {
      const shop = shops.get(String(row.business_id));
      const fee = money(row.sale_price);
      const active = row.is_active == null || Boolean(row.is_active);
      const published = row.is_published == null || Boolean(row.is_published);
      if (!shop || fee <= 0 || !active || !published) continue;
      providers.push({
        id: shop.id,
        offerId: `product:${row.id}`,
        name: shop.name,
        offerTitle: String(row.name ?? "Delivery").trim() || "Delivery",
        source: "product",
        fee,
        location: shop.location,
        phone: shop.phone,
        logoUrl: shop.logoUrl || (row.image_url as string | null),
      });
    }
  }

  providers.sort((a, b) => a.fee - b.fee || a.name.localeCompare(b.name));
  return { providers, error: null };
}
