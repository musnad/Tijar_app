import { requireVerifiedShop } from "@/lib/kyc/require-shop-verified";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { displayShopName, shopLinkSlug } from "@/lib/shop-names";
import { uploadProductImage } from "@/services/product-image-service";

export const PLACE_ORDER_CATEGORIES = ["food", "snacks", "drinks", "meals", "other"] as const;
export type PlaceOrderCategory = (typeof PLACE_ORDER_CATEGORIES)[number];
export type PlaceOrderDay = "today" | "tomorrow" | "both";
export type PlaceOrderFulfilment = "pickup" | "delivery";
export type PlaceOrderSlot = { date: string; from: string; until: string };

export type PlaceOrderListing = {
  id: string;
  business_id: string;
  title: string;
  details: string | null;
  category: PlaceOrderCategory;
  price: number;
  image_urls: string[];
  location_label: string | null;
  latitude: number | null;
  longitude: number | null;
  available_on: PlaceOrderDay;
  pickup_enabled: boolean;
  delivery_enabled: boolean;
  delivery_fee: number;
  ready_from: string | null;
  ready_until: string | null;
  same_day: PlaceOrderSlot | null;
  next_day: PlaceOrderSlot | null;
  qty_note: string | null;
  quantity: number | null;
  sold_count: number;
  is_open: boolean;
  like_count: number;
  comment_count: number;
  share_count: number;
  created_at: string;
  shop_name: string;
  shop_slug: string;
  shop_logo: string | null;
};

export type PlaceOrderRequest = {
  id: string;
  listing_id: string;
  business_id: string;
  buyer_id: string;
  quantity: number;
  fulfilment: PlaceOrderFulfilment;
  slot_day: "today" | "tomorrow";
  slot_time: string;
  delivery_address: string | null;
  pickup_address?: string | null;
  dropoff_address?: string | null;
  buyer_phone: string | null;
  buyer_note: string | null;
  unit_price: number;
  total: number;
  delivery_fee?: number | null;
  platform_fee_ngn?: number | null;
  seller_net_ngn?: number | null;
  status: string;
  buyer_marked_paid_at: string | null;
  created_at: string;
  listing_title?: string;
  listing_image?: string | null;
  shop_name?: string;
  buyer_name?: string | null;
};

function missingTable(message: string): boolean {
  return /place_order_listings|place_order_requests|place_order_likes|place_order_comments|schema cache|does not exist/i.test(message);
}

export function localYmd(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatSlotDate(ymd: string | null | undefined): string {
  if (!ymd) return "";
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" });
}

export function formatSlotWindow(slot: PlaceOrderSlot | null | undefined): string {
  if (!slot) return "";
  const when = formatSlotDate(slot.date);
  const from = slot.from || "";
  const until = slot.until || "";
  const hours = from && until ? `${from}–${until}` : from || until;
  return [when, hours].filter(Boolean).join(" · ");
}

function parseSlot(value: unknown): PlaceOrderSlot | null {
  if (!value || typeof value !== "object") return null;
  const rec = value as Record<string, unknown>;
  const date = String(rec.date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return {
    date,
    from: String(rec.from ?? rec.ready_from ?? "").slice(0, 5) || "10:00",
    until: String(rec.until ?? rec.ready_until ?? "").slice(0, 5) || "18:00",
  };
}

function parseSchedule(row: Record<string, unknown>): { same: PlaceOrderSlot | null; next: PlaceOrderSlot | null } {
  const direct = row.schedule;
  if (direct && typeof direct === "object") {
    const rec = direct as Record<string, unknown>;
    return { same: parseSlot(rec.same ?? rec.today), next: parseSlot(rec.next ?? rec.tomorrow) };
  }
  const raw = String(row.ready_from ?? "");
  if (raw.startsWith("sched:")) {
    try {
      const rec = JSON.parse(raw.slice(6)) as Record<string, unknown>;
      return { same: parseSlot(rec.same ?? rec.today), next: parseSlot(rec.next ?? rec.tomorrow) };
    } catch {
      /* fall through */
    }
  }
  const from = raw && !raw.startsWith("sched:") && !raw.startsWith("{") ? raw.slice(0, 5) : "10:00";
  const until = String(row.ready_until ?? "18:00").slice(0, 5);
  const created = String(row.created_at ?? "");
  const base = created ? created.slice(0, 10) : localYmd(0);
  const nextDate = (() => {
    const d = new Date(`${base}T12:00:00`);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();
  const available = String(row.available_on ?? "today");
  return {
    same: available === "tomorrow" ? null : { date: base, from, until },
    next: available === "today" ? null : { date: nextDate, from, until },
  };
}

export function encodePlaceOrderSchedule(input: {
  availableOn: PlaceOrderDay;
  same?: PlaceOrderSlot | null;
  next?: PlaceOrderSlot | null;
}): string {
  const payload = {
    same: input.availableOn === "tomorrow" ? null : input.same ?? { date: localYmd(0), from: "10:00", until: "18:00" },
    next: input.availableOn === "today" ? null : input.next ?? { date: localYmd(1), from: "10:00", until: "18:00" },
  };
  return `sched:${JSON.stringify(payload)}`;
}

function asListing(
  row: Record<string, unknown>,
  shop?: { business_name?: string | null; public_slug?: string | null; logo_url?: string | null; id?: string },
): PlaceOrderListing {
  const images = Array.isArray(row.image_urls) ? (row.image_urls as string[]).filter(Boolean) : [];
  const schedule = parseSchedule(row);
  return {
    id: row.id as string,
    business_id: row.business_id as string,
    title: (row.title as string) || "Place your order",
    details: (row.details as string | null) ?? null,
    category: (PLACE_ORDER_CATEGORIES.includes(row.category as PlaceOrderCategory)
      ? row.category
      : "food") as PlaceOrderCategory,
    price: Number(row.price ?? 0),
    image_urls: images,
    location_label: (row.location_label as string | null) ?? null,
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
    available_on: (row.available_on as PlaceOrderDay) || "today",
    pickup_enabled: row.pickup_enabled !== false,
    delivery_enabled: row.delivery_enabled !== false,
    delivery_fee: Math.max(0, Number(row.delivery_fee ?? 0)),
    ready_from: (row.ready_from as string | null) ?? null,
    ready_until: (row.ready_until as string | null) ?? null,
    same_day: schedule.same,
    next_day: schedule.next,
    qty_note: (row.qty_note as string | null) ?? null,
    quantity: row.quantity != null ? Number(row.quantity) : null,
    sold_count: Number(row.sold_count ?? 0),
    is_open: row.is_open !== false,
    like_count: Number(row.like_count ?? 0),
    comment_count: Number(row.comment_count ?? 0),
    share_count: Number(row.share_count ?? 0),
    created_at: row.created_at as string,
    shop_name: displayShopName(shop?.business_name ?? "Shop"),
    shop_slug: shopLinkSlug(shop?.public_slug ?? null, shop?.id ?? (row.business_id as string)),
    shop_logo: shop?.logo_url ?? null,
  };
}

async function attachShops(rows: Record<string, unknown>[]): Promise<PlaceOrderListing[]> {
  const ids = [...new Set(rows.map((r) => r.business_id as string).filter(Boolean))];
  const shops = new Map<string, { business_name?: string | null; public_slug?: string | null; logo_url?: string | null; id?: string }>();
  if (ids.length > 0) {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase
      .from("businesses")
      .select("id, business_name, public_slug, logo_url")
      .in("id", ids);
    for (const shop of data ?? []) {
      shops.set(shop.id as string, shop);
    }
  }
  return rows.map((row) => asListing(row, shops.get(row.business_id as string)));
}

export async function fetchPlaceOrderListings(filters?: {
  day?: "today" | "tomorrow" | "all";
  category?: PlaceOrderCategory | "all";
  search?: string;
  limit?: number;
}): Promise<{ listings: PlaceOrderListing[]; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  let query = supabase
    .from("place_order_listings")
    .select("*")
    .eq("is_open", true)
    .order("created_at", { ascending: false })
    .limit(filters?.limit ?? 80);
  const day = filters?.day ?? "all";
  if (day === "today") query = query.in("available_on", ["today", "both"]);
  if (day === "tomorrow") query = query.in("available_on", ["tomorrow", "both"]);
  if (filters?.category && filters.category !== "all") query = query.eq("category", filters.category);
  const { data, error } = await query;
  if (error) {
    if (missingTable(error.message)) {
      return { listings: [], error: "Place your order is not set up yet. Apply migration 000040 in Supabase." };
    }
    return { listings: [], error: error.message };
  }
  let listings = await attachShops((data ?? []) as Record<string, unknown>[]);
  const search = filters?.search?.trim().toLowerCase();
  if (search) {
    listings = listings.filter((item) =>
      [item.title, item.details, item.shop_name, item.location_label, item.category].join(" ").toLowerCase().includes(search),
    );
  }
  return { listings, error: null };
}

export async function fetchPlaceOrderListing(id: string): Promise<{ listing: PlaceOrderListing | null; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.from("place_order_listings").select("*").eq("id", id).maybeSingle();
  if (error) {
    if (missingTable(error.message)) return { listing: null, error: "Place your order is not set up yet. Apply migration 000040 in Supabase." };
    return { listing: null, error: error.message };
  }
  if (!data) return { listing: null, error: "This order post is no longer open." };
  const [listing] = await attachShops([data as Record<string, unknown>]);
  return { listing: listing ?? null, error: null };
}

export async function fetchMyPlaceOrderListings(businessId: string): Promise<{ listings: PlaceOrderListing[]; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("place_order_listings")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) {
    if (missingTable(error.message)) return { listings: [], error: error.message };
    return { listings: [], error: error.message };
  }
  return { listings: await attachShops((data ?? []) as Record<string, unknown>[]), error: null };
}

export async function publishPlaceOrderListing(input: {
  businessId: string;
  title: string;
  details: string;
  category: PlaceOrderCategory;
  price: number;
  photos: File[];
  existingUrls?: string[];
  locationLabel: string;
  latitude?: number | null;
  longitude?: number | null;
  availableOn: PlaceOrderDay;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  deliveryFee?: number;
  sameDay?: PlaceOrderSlot | null;
  nextDay?: PlaceOrderSlot | null;
  readyFrom?: string;
  readyUntil?: string;
  qtyNote?: string;
}): Promise<{ listing: PlaceOrderListing | null; error: string | null }> {
  const blocked = await requireVerifiedShop(input.businessId);
  if (blocked) return { listing: null, error: blocked };
  const id = crypto.randomUUID();
  const uploaded: string[] = [...(input.existingUrls ?? [])];
  for (let i = 0; i < input.photos.length; i += 1) {
    const file = input.photos[i]!;
    const result = await uploadProductImage(input.businessId, `place-order-${id}`, file, i);
    if (result.error || !result.publicUrl) return { listing: null, error: result.error ?? "Could not upload photo." };
    uploaded.push(result.publicUrl);
  }
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("place_order_listings")
    .insert({
      id,
      business_id: input.businessId,
      title: input.title.trim(),
      details: input.details.trim() || null,
      category: input.category,
      price: input.price,
      image_urls: uploaded,
      location_label: input.locationLabel.trim() || null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      available_on: input.availableOn,
      pickup_enabled: input.pickupEnabled,
      delivery_enabled: input.deliveryEnabled,
      delivery_fee: Math.max(0, Number(input.deliveryFee ?? 0)),
      ready_from: encodePlaceOrderSchedule({
        availableOn: input.availableOn,
        same: input.sameDay ?? (input.readyFrom ? { date: localYmd(0), from: input.readyFrom, until: input.readyUntil || "18:00" } : null),
        next: input.nextDay ?? (input.readyFrom ? { date: localYmd(1), from: input.readyFrom, until: input.readyUntil || "18:00" } : null),
      }),
      ready_until: (input.sameDay?.until || input.nextDay?.until || input.readyUntil)?.trim() || null,
      qty_note: input.qtyNote?.trim() || null,
      is_open: true,
    })
    .select("*")
    .single();
  if (error && /delivery_fee/i.test(error.message)) {
    const retry = await supabase
      .from("place_order_listings")
      .insert({
        id,
        business_id: input.businessId,
        title: input.title.trim(),
        details: input.details.trim() || null,
        category: input.category,
        price: input.price,
        image_urls: uploaded,
        location_label: input.locationLabel.trim() || null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        available_on: input.availableOn,
        pickup_enabled: input.pickupEnabled,
        delivery_enabled: input.deliveryEnabled,
        ready_from: encodePlaceOrderSchedule({
          availableOn: input.availableOn,
          same: input.sameDay ?? (input.readyFrom ? { date: localYmd(0), from: input.readyFrom, until: input.readyUntil || "18:00" } : null),
          next: input.nextDay ?? (input.readyFrom ? { date: localYmd(1), from: input.readyFrom, until: input.readyUntil || "18:00" } : null),
        }),
        ready_until: (input.sameDay?.until || input.nextDay?.until || input.readyUntil)?.trim() || null,
        qty_note: input.qtyNote?.trim() || null,
        is_open: true,
      })
      .select("*")
      .single();
    if (!retry.error && retry.data) {
      const [listing] = await attachShops([retry.data as Record<string, unknown>]);
      return { listing: listing ?? null, error: null };
    }
    return { listing: null, error: retry.error?.message ?? error.message };
  }
  if (error) {
    if (missingTable(error.message)) {
      return { listing: null, error: "Place your order is not set up yet. Apply migration 000040 in Supabase." };
    }
    return { listing: null, error: error.message };
  }
  const [listing] = await attachShops([data as Record<string, unknown>]);
  return { listing: listing ?? null, error: null };
}

export async function closePlaceOrderListing(id: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("place_order_listings").update({ is_open: false, updated_at: new Date().toISOString() }).eq("id", id);
  return { error: error?.message ?? null };
}

export async function placeYourOrder(input: {
  listingId: string;
  businessId: string;
  buyerId: string;
  quantity: number;
  fulfilment: PlaceOrderFulfilment;
  slotDay: "today" | "tomorrow";
  slotTime: string;
  deliveryAddress?: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  buyerPhone?: string;
  buyerNote?: string;
  unitPrice: number;
  listingTitle?: string;
  deliveryFee?: number;
}): Promise<{ order: PlaceOrderRequest | null; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const listingFee = Math.max(0, Number(input.deliveryFee ?? 0));
  const deliveryFee = input.fulfilment === "delivery" ? listingFee : 0;
  const total = Number(input.quantity) * Number(input.unitPrice) + deliveryFee;
  const pickup = input.pickupAddress?.trim() || null;
  const dropoff = input.dropoffAddress?.trim() || input.deliveryAddress?.trim() || null;
  const combined =
    input.fulfilment === "delivery" && (pickup || dropoff)
      ? [pickup ? `Pickup: ${pickup}` : null, dropoff ? `Drop-off: ${dropoff}` : null].filter(Boolean).join(" · ")
      : input.deliveryAddress?.trim() || null;
  const row: Record<string, unknown> = {
    listing_id: input.listingId,
    business_id: input.businessId,
    buyer_id: input.buyerId,
    quantity: input.quantity,
    fulfilment: input.fulfilment,
    slot_day: input.slotDay,
    slot_time: input.slotTime.trim(),
    delivery_address: combined,
    pickup_address: pickup,
    dropoff_address: dropoff,
    buyer_phone: input.buyerPhone?.trim() || null,
    buyer_note: input.buyerNote?.trim() || null,
    unit_price: input.unitPrice,
    total,
    delivery_fee: deliveryFee,
    status: "placed",
  };
  let { data, error } = await supabase.from("place_order_requests").insert(row).select("*").single();
  if (error && /pickup_address|dropoff_address|delivery_fee|schema cache|column/i.test(error.message)) {
    delete row.pickup_address;
    delete row.dropoff_address;
    if (/delivery_fee/i.test(error.message)) delete row.delivery_fee;
    const retry = await supabase.from("place_order_requests").insert(row).select("*").single();
    data = retry.data;
    error = retry.error;
  }
  if (error) {
    if (missingTable(error.message)) {
      return { order: null, error: "Place your order is not set up yet. Apply migration 000040 in Supabase." };
    }
    return { order: null, error: error.message };
  }
  const order = data as PlaceOrderRequest;
  const { data: buyer } = await supabase.from("profiles").select("full_name").eq("id", input.buyerId).maybeSingle();
  const buyerName = String(buyer?.full_name ?? "").trim() || "A customer";
  const item = input.listingTitle?.trim() || "an order";
  await notifyShopPlaceOrder({
    businessId: input.businessId,
    buyerId: input.buyerId,
    kind: "place_order",
    title: `${buyerName} placed an order`,
    body: `${buyerName} placed an order of ${input.quantity} × ${item} · ${placeOrderNoticeBody({
      fulfilment: input.fulfilment,
      quantity: input.quantity,
      total,
      phone: input.buyerPhone,
      address: combined,
      note: input.buyerNote,
      slotDay: input.slotDay,
      slotTime: input.slotTime,
    })}`,
  });
  return { order, error: null };
}

function placeOrderNoticeBody(input: {
  fulfilment: PlaceOrderFulfilment;
  quantity: number;
  total: number;
  phone?: string | null;
  address?: string | null;
  note?: string | null;
  slotDay: string;
  slotTime: string;
}): string {
  const bits = [
    input.fulfilment === "delivery" ? "Delivery" : "Pickup",
    `${input.quantity} item${input.quantity === 1 ? "" : "s"}`,
    `₦${Number(input.total).toLocaleString()}`,
    input.slotDay === "tomorrow" ? "Next day" : "Same day",
    input.slotTime,
    `Phone ${input.phone?.trim() || "not given"}`,
  ];
  if (input.fulfilment === "delivery") bits.push(input.address?.trim() || "no pickup/drop-off yet");
  if (input.note?.trim()) bits.push(`Note: ${input.note.trim()}`);
  return bits.join(" · ");
}

async function notifyShopPlaceOrder(input: {
  businessId: string;
  buyerId: string;
  kind: "place_order" | "place_order_paid";
  title: string;
  body: string;
}): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const { data: shop } = await supabase.from("businesses").select("owner_id").eq("id", input.businessId).maybeSingle();
  if (!shop?.owner_id || shop.owner_id === input.buyerId) return;
  const payload = {
    p_recipient: shop.owner_id,
    p_actor: input.buyerId,
    p_kind: input.kind,
    p_title: input.title,
    p_body: input.body,
    p_business_id: input.businessId,
    p_video_post_id: null as string | null,
  };
  const first = await supabase.rpc("notify_activity", payload);
  if (first.error && /kind|check|invalid/i.test(first.error.message)) {
    await supabase.rpc("notify_activity", { ...payload, p_kind: "comment" });
  }
}

export async function markPlaceOrderPaid(orderId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from("place_order_requests")
    .update({
      status: "paid",
      buyer_marked_paid_at: new Date().toISOString(),
    })
    .eq("id", orderId);
  if (!error) {
    const { data } = await supabase.from("place_order_requests").select("*").eq("id", orderId).maybeSingle();
    if (data) {
      await notifyShopPlaceOrder({
        businessId: data.business_id as string,
        buyerId: data.buyer_id as string,
        kind: "place_order_paid",
        title: "Paid order",
        body: placeOrderNoticeBody({
          fulfilment: data.fulfilment as PlaceOrderFulfilment,
          quantity: Number(data.quantity),
          total: Number(data.total),
          phone: data.buyer_phone as string | null,
          address: data.delivery_address as string | null,
          note: data.buyer_note as string | null,
          slotDay: data.slot_day as string,
          slotTime: data.slot_time as string,
        }),
      });
    }
  }
  return { error: error?.message ?? null };
}

export async function fetchMyPlaceOrders(buyerId: string): Promise<{ orders: PlaceOrderRequest[]; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("place_order_requests")
    .select("*")
    .eq("buyer_id", buyerId)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) return { orders: [], error: missingTable(error.message) ? null : error.message };
  return { orders: await decorateRequests((data ?? []) as Record<string, unknown>[]), error: null };
}

export async function fetchShopPlaceOrders(businessId: string): Promise<{ orders: PlaceOrderRequest[]; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("place_order_requests")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) return { orders: [], error: missingTable(error.message) ? null : error.message };
  return { orders: await decorateRequests((data ?? []) as Record<string, unknown>[]), error: null };
}

export async function updatePlaceOrderStatus(orderId: string, status: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("place_order_requests").update({ status }).eq("id", orderId);
  return { error: error?.message ?? null };
}

export async function markPlaceOrderReceived(orderId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("place_order_requests")
    .update({ status: "completed" })
    .eq("id", orderId)
    .in("status", ["paid", "preparing", "ready"])
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data?.id) return { error: "Tap Received after the shop has this order." };
  return { error: null };
}

async function decorateRequests(rows: Record<string, unknown>[]): Promise<PlaceOrderRequest[]> {
  const listingIds = [...new Set(rows.map((r) => r.listing_id as string))];
  const shopIds = [...new Set(rows.map((r) => r.business_id as string))];
  const supabase = getSupabaseBrowserClient();
  const listings =
    listingIds.length > 0
      ? await supabase.from("place_order_listings").select("id, title, image_urls").in("id", listingIds)
      : { data: [] as Array<{ id: string; title: string; image_urls: string[] }> };
  const shops =
    shopIds.length > 0
      ? await supabase.from("businesses").select("id, business_name").in("id", shopIds)
      : { data: [] as Array<{ id: string; business_name: string }> };
  const listingMap = new Map((listings.data ?? []).map((row) => [row.id, row]));
  const shopMap = new Map((shops.data ?? []).map((row) => [row.id, row]));
  const buyerIds = [...new Set(rows.map((r) => r.buyer_id as string).filter(Boolean))];
  const buyers =
    buyerIds.length > 0
      ? await supabase.from("profiles").select("id, full_name, phone").in("id", buyerIds)
      : { data: [] as Array<{ id: string; full_name: string | null; phone: string | null }> };
  const buyerMap = new Map((buyers.data ?? []).map((row) => [row.id, row]));
  return rows.map((row) => {
    const listing = listingMap.get(row.listing_id as string);
    const shop = shopMap.get(row.business_id as string);
    const buyer = buyerMap.get(row.buyer_id as string);
    const images = Array.isArray(listing?.image_urls) ? listing.image_urls : [];
    return {
      id: row.id as string,
      listing_id: row.listing_id as string,
      business_id: row.business_id as string,
      buyer_id: row.buyer_id as string,
      quantity: Number(row.quantity),
      fulfilment: row.fulfilment as PlaceOrderFulfilment,
      slot_day: row.slot_day as "today" | "tomorrow",
      slot_time: row.slot_time as string,
      delivery_address: (row.delivery_address as string | null) ?? null,
      pickup_address: (row.pickup_address as string | null) ?? null,
      dropoff_address: (row.dropoff_address as string | null) ?? null,
      buyer_phone: (row.buyer_phone as string | null) ?? buyer?.phone ?? null,
      buyer_note: (row.buyer_note as string | null) ?? null,
      unit_price: Number(row.unit_price),
      total: Number(row.total),
      delivery_fee: row.delivery_fee != null ? Number(row.delivery_fee) : null,
      platform_fee_ngn: row.platform_fee_ngn != null ? Number(row.platform_fee_ngn) : null,
      seller_net_ngn: row.seller_net_ngn != null ? Number(row.seller_net_ngn) : null,
      status: row.status as string,
      buyer_marked_paid_at: (row.buyer_marked_paid_at as string | null) ?? null,
      created_at: row.created_at as string,
      listing_title: listing?.title,
      listing_image: images[0] ?? null,
      shop_name: shop ? displayShopName(shop.business_name) : "Shop",
      buyer_name: buyer?.full_name?.trim() || null,
    };
  });
}

export function placeOrderPayLabel(status: string): "Paid" | "Pending" {
  if (status === "paid" || status === "preparing" || status === "ready" || status === "completed") return "Paid";
  return "Pending";
}

export function placeOrderStatusLabel(status: string): string {
  if (status === "placed") return "Pending";
  if (status === "paid") return "Paid";
  if (status === "preparing") return "Preparing";
  if (status === "ready") return "Ready";
  if (status === "completed") return "Completed";
  if (status === "cancelled") return "Cancelled";
  return status;
}

export function dayLabel(value: PlaceOrderDay): string {
  if (value === "today") return "Same day";
  if (value === "tomorrow") return "Next day";
  return "Same day & next day";
}

export function listingWhenLabel(listing: Pick<PlaceOrderListing, "available_on" | "same_day" | "next_day">): string {
  const bits = [formatSlotWindow(listing.same_day), formatSlotWindow(listing.next_day)].filter(Boolean);
  return bits.join(" · ") || dayLabel(listing.available_on);
}

export function categoryLabel(value: PlaceOrderCategory): string {
  const labels: Record<PlaceOrderCategory, string> = {
    food: "Food",
    snacks: "Snacks",
    drinks: "Drinks",
    meals: "Meals",
    other: "Other",
  };
  return labels[value];
}

export type PlaceOrderComment = {
  id: string;
  listing_id: string;
  profile_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  author_name?: string;
};

export function placeOrderShareUrl(listingId: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/shop/order-now/${listingId}`;
}

export async function sharePlaceOrderPost(listing: {
  id: string;
  title: string;
  shop_name: string;
}): Promise<{ shared: boolean }> {
  const url = placeOrderShareUrl(listing.id);
  try {
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({
        title: listing.title,
        text: `Place your order from ${listing.shop_name}`,
        url,
      });
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
    }
    await recordPlaceOrderShare(listing.id);
    return { shared: true };
  } catch {
    return { shared: false };
  }
}

export async function recordPlaceOrderShare(listingId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  await supabase.rpc("record_place_order_share", { p_listing_id: listingId });
}

export async function fetchMyLikedPlaceOrderIds(profileId: string): Promise<Set<string>> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.from("place_order_likes").select("listing_id").eq("profile_id", profileId);
  if (error) return new Set();
  return new Set((data ?? []).map((row) => row.listing_id as string));
}

export async function togglePlaceOrderLike(
  profileId: string,
  listingId: string,
): Promise<{ liked: boolean; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { data: existing } = await supabase
    .from("place_order_likes")
    .select("profile_id")
    .eq("profile_id", profileId)
    .eq("listing_id", listingId)
    .maybeSingle();
  if (existing) {
    const { error } = await supabase.from("place_order_likes").delete().eq("profile_id", profileId).eq("listing_id", listingId);
    return { liked: false, error: missingTable(error?.message ?? "") ? "Likes are not set up yet. Apply migration 000044." : error?.message ?? null };
  }
  const { error } = await supabase.from("place_order_likes").insert({ profile_id: profileId, listing_id: listingId });
  if (error?.code === "23505") return { liked: true, error: null };
  if (error && missingTable(error.message)) return { liked: false, error: "Likes are not set up yet. Apply migration 000044." };
  return { liked: true, error: error?.message ?? null };
}

export async function fetchPlaceOrderComments(
  listingId: string,
): Promise<{ comments: PlaceOrderComment[]; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("place_order_comments")
    .select("id, listing_id, profile_id, parent_id, body, created_at")
    .eq("listing_id", listingId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) {
    return { comments: [], error: missingTable(error.message) ? "Comments are not set up yet. Apply migration 000044." : error.message };
  }
  const comments = (data ?? []) as PlaceOrderComment[];
  const ids = [...new Set(comments.map((c) => c.profile_id))];
  if (ids.length === 0) return { comments, error: null };
  const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", ids);
  const names = new Map((profiles ?? []).map((p) => [p.id as string, p.full_name as string]));
  return {
    comments: comments.map((c) => ({ ...c, author_name: names.get(c.profile_id) ?? "Shopper" })),
    error: null,
  };
}

export function placeOrderRemaining(listing: Pick<PlaceOrderListing, "quantity" | "sold_count">): number | null {
  if (listing.quantity == null || !Number.isFinite(listing.quantity)) return null;
  return Math.max(0, listing.quantity - listing.sold_count);
}

export function placeOrderSoldOut(listing: Pick<PlaceOrderListing, "quantity" | "sold_count" | "is_open">): boolean {
  const left = placeOrderRemaining(listing);
  return left === 0;
}

export async function updatePlaceOrderComment(input: {
  commentId: string;
  profileId: string;
  body: string;
}): Promise<{ error: string | null }> {
  const text = input.body.trim();
  if (!text) return { error: "Write a comment first." };
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from("place_order_comments")
    .update({ body: text })
    .eq("id", input.commentId)
    .eq("profile_id", input.profileId);
  if (error && missingTable(error.message)) return { error: "Comments are not set up yet." };
  return { error: error?.message ?? null };
}

export async function deletePlaceOrderComment(input: {
  commentId: string;
  profileId: string;
}): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from("place_order_comments")
    .delete()
    .eq("id", input.commentId)
    .eq("profile_id", input.profileId);
  if (error && missingTable(error.message)) return { error: "Comments are not set up yet." };
  return { error: error?.message ?? null };
}

export async function postPlaceOrderComment(input: {
  profileId: string;
  listingId: string;
  body: string;
  parentId?: string | null;
}): Promise<{ error: string | null }> {
  const text = input.body.trim();
  if (!text) return { error: "Write a comment first." };
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("place_order_comments").insert({
    profile_id: input.profileId,
    listing_id: input.listingId,
    parent_id: input.parentId ?? null,
    body: text,
  });
  if (error && missingTable(error.message)) return { error: "Comments are not set up yet. Apply migration 000044." };
  return { error: error?.message ?? null };
}
