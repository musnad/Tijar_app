import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type DeliveryProvider = {
  id: string;
  offerId: string;
  name: string;
  offerTitle: string;
  source: "place_order" | "product" | "shop";
  fee: number;
  location: string | null;
  phone: string | null;
  logoUrl: string | null;
};

const COURIER_SLUGS = ["logistics", "okada", "transport"];

/** Shop names/categories that count as a delivery company. */
export const DELIVERY_COMPANY_PATTERN =
  /\b(deliver(?:y|ies|ing)?|dispatch(?:es|er)?|riders?|logistics?|couriers?|haulage|okada|keke|transporter?s?|shipping)\b/i;

const NAME_FILTER =
  "business_name.ilike.%deliver%,business_name.ilike.%dispatch%,business_name.ilike.%rider%,business_name.ilike.%logistic%,business_name.ilike.%courier%,business_name.ilike.%haulage%,business_name.ilike.%okada%,business_name.ilike.%keke%,business_name.ilike.%transporter%,business_name.ilike.%shipping%,custom_category.ilike.%deliver%,custom_category.ilike.%dispatch%,custom_category.ilike.%rider%,custom_category.ilike.%logistic%,custom_category.ilike.%courier%,custom_category.ilike.%okada%,custom_category.ilike.%transport%";

export function isDeliveryCompanyText(...parts: Array<string | null | undefined>): boolean {
  return DELIVERY_COMPANY_PATTERN.test(parts.map((p) => String(p ?? "")).join(" "));
}

function money(n: unknown): number {
  const v = Number(n ?? 0);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

function feeFromPlaceOrder(price: unknown, deliveryFee: unknown): number {
  const extra = money(deliveryFee);
  if (extra > 0) return extra;
  return money(price);
}

type ShopRow = {
  id: string;
  name: string;
  location: string | null;
  phone: string | null;
  logoUrl: string | null;
  shopFee: number;
  offerId: string;
  offerTitle: string;
  source: DeliveryProvider["source"];
  fee: number;
};

function rememberShop(map: Map<string, ShopRow>, row: ShopRow): void {
  const existing = map.get(row.id);
  if (!existing) {
    map.set(row.id, row);
    return;
  }
  if (row.fee > 0 && (existing.fee <= 0 || row.fee < existing.fee)) {
    map.set(row.id, { ...existing, ...row, shopFee: existing.shopFee });
  }
}

export async function fetchDeliveryProviders(): Promise<{
  providers: DeliveryProvider[];
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  const cats = await supabase.from("business_categories").select("id, slug").in("slug", COURIER_SLUGS);
  const catIds = (cats.data ?? []).map((row) => String(row.id));
  const selectWithFee =
    "id, business_name, public_location_label, location, public_phone, logo_url, category_id, custom_category, is_published, delivery_fee";
  const selectNoFee =
    "id, business_name, public_location_label, location, public_phone, logo_url, category_id, custom_category, is_published";
  const rows: Array<Record<string, unknown>> = [];

  async function loadShops(selectCols: string) {
    if (catIds.length > 0) {
      const byCat = await supabase.from("businesses").select(selectCols).eq("is_published", true).in("category_id", catIds).limit(200);
      if (byCat.error) return byCat.error.message;
      rows.push(...((byCat.data ?? []) as Array<Record<string, unknown>>));
    }
    const byName = await supabase.from("businesses").select(selectCols).eq("is_published", true).or(NAME_FILTER).limit(200);
    if (byName.error) return byName.error.message;
    rows.push(...((byName.data ?? []) as Array<Record<string, unknown>>));
    return null;
  }

  const firstErr = await loadShops(selectWithFee);
  if (firstErr && /delivery_fee/i.test(firstErr)) {
    rows.length = 0;
    await loadShops(selectNoFee);
  }

  const shops = new Map<string, ShopRow>();
  for (const row of rows) {
    const id = String(row.id ?? "");
    if (!id) continue;
    const name = String(row.business_name ?? "");
    const custom = String(row.custom_category ?? "");
    const categoryMatch = catIds.includes(String(row.category_id ?? ""));
    if (!categoryMatch && !isDeliveryCompanyText(name, custom)) continue;
    const shopFee = money(row.delivery_fee);
    shops.set(id, {
      id,
      name: name.trim() || "Delivery company",
      location: (row.public_location_label as string | null) || (row.location as string | null),
      phone: (row.public_phone as string | null) ?? null,
      logoUrl: (row.logo_url as string | null) ?? null,
      shopFee,
      offerId: `shop:${id}`,
      offerTitle: "Delivery company",
      source: "shop",
      fee: shopFee,
    });
  }

  const ids = [...shops.keys()];
  if (ids.length === 0) return { providers: [], error: null };

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
      if (!shop) continue;
      rememberShop(shops, {
        ...shop,
        offerId: `place:${row.id}`,
        offerTitle: String(row.title ?? "Place your order").trim() || "Place your order",
        source: "place_order",
        fee: fee > 0 ? fee : shop.fee,
        location: (row.location_label as string | null) || shop.location,
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
      if (!shop || !active || !published) continue;
      rememberShop(shops, {
        ...shop,
        offerId: `product:${row.id}`,
        offerTitle: String(row.name ?? "Delivery").trim() || "Delivery",
        source: "product",
        fee: fee > 0 ? fee : shop.fee,
        logoUrl: shop.logoUrl || (row.image_url as string | null),
      });
    }
  }

  const providers: DeliveryProvider[] = [...shops.values()]
    .map((shop) => ({
      id: shop.id,
      offerId: shop.offerId,
      name: shop.name,
      offerTitle: shop.offerTitle,
      source: shop.source,
      fee: shop.fee,
      location: shop.location,
      phone: shop.phone,
      logoUrl: shop.logoUrl,
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.fee - b.fee);

  return { providers, error: null };
}
