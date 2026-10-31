import { isMockFeedId } from "@/features/marketplace/feed-mock";
import {
  addLocalCartItem,
  isLocalCartId,
  listLocalCart,
  removeLocalCartItem,
  updateLocalCartQuantity,
} from "@/lib/local-cart";
import {
  ensureSavedProduct,
  getLocalOrder,
  listFollowedShopsAsBusinesses,
  listLocalOrders,
  listSavedProducts,
  listShopFollowers,
} from "@/lib/shop-social";
import { displayShopName, lookupShopProfiles } from "@/lib/shop-names";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { ensureOwnerMembership } from "@/services/business-service";
import type { CheckoutQuote } from "@/lib/checkout/quote";
import { isLivePaymentConfigured } from "@/lib/payments/adapter";
import type {
  CartItem,
  CustomerAddress,
  MarketplaceOrder,
  MarketplaceOrderItem,
  NotificationPreferences,
  PublicBusiness,
  PublicProduct,
} from "@/types/database";
import { haversineKm } from "@/utils/discover";

export type NearbyMarketplaceShop = PublicBusiness & {
  distance_km: number;
  products: PublicProduct[];
};

export type MarketplaceShop = PublicBusiness & {
  product_count: number;
  product_names: string[];
};

const MARKETPLACE_SHOP_SELECT =
  "id, slug, business_name, description, location_text, public_location_label, latitude, longitude, logo_url, cover_image_url, category_id, category_name, public_phone, public_whatsapp, opening_hours, is_verified, verification_status, is_informal";

const MARKETPLACE_PRODUCT_SELECT =
  "id, business_id, name, kind, description, sale_price, unit, image_url, extra_image_urls, video_url, attributes, variants, currency, is_available, created_at, updated_at, is_informal, business_name, business_slug, business_logo_url, category_name, service_type, starts_on, ends_on";

const MARKETPLACE_PRODUCT_SELECT_LEGACY =
  "id, business_id, name, kind, description, sale_price, unit, image_url, is_available";

export async function fetchMarketplaceProducts(limit = 48, before?: string | null): Promise<{
  data: PublicProduct[];
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  let query = supabase
    .from("public_business_products")
    .select(MARKETPLACE_PRODUCT_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (before) query = query.lt("created_at", before);
  let { data, error } = await query;
  if (error && /created_at/i.test(error.message)) {
    const retry = await supabase
      .from("public_business_products")
      .select(MARKETPLACE_PRODUCT_SELECT)
      .order("name")
      .limit(limit);
    data = retry.data;
    error = retry.error;
  }

  // Fallback before informal marketplace migration is applied.
  if (error) {
    const legacy = await supabase
      .from("public_business_products")
      .select(MARKETPLACE_PRODUCT_SELECT_LEGACY)
      .order("name")
      .limit(limit);
    if (legacy.error) return { data: [], error: legacy.error.message };
    data = legacy.data;
    error = null;

    const { data: listings } = await supabase
      .from("public_business_listings")
      .select("id, slug, business_name, is_informal")
      .limit(400);
    const byId = new Map((listings ?? []).map((b) => [b.id as string, b]));
    return {
      data: await attachProductShopNames(
        (data ?? []).map((p) => {
          const b = byId.get(p.business_id as string);
          return {
            ...(p as PublicProduct),
            business_name: (b?.business_name as string) ?? undefined,
            business_slug: (b?.slug as string) ?? undefined,
            is_informal: (b?.is_informal as boolean | undefined) ?? true,
          };
        }),
      ),
      error: null,
    };
  }

  return {
    data: await attachProductShopNames((data ?? []) as PublicProduct[]),
    error: null,
  };
}

async function attachProductShopNames(products: PublicProduct[]): Promise<PublicProduct[]> {
  if (products.length === 0) return products;
  const found = await lookupShopProfiles(products.map((p) => p.business_id));
  return products.map((p) => {
    const shop = found.get(p.business_id);
    return {
      ...p,
      business_name: displayShopName(shop?.business_name ?? p.business_name),
      business_slug: shop?.slug ?? p.business_slug ?? p.business_id,
      business_logo_url: shop?.logo_url ?? p.business_logo_url,
    };
  });
}

/** Published informal businesses for marketplace landing — includes shops without products. */
export async function fetchMarketplaceShops(limit = 200): Promise<{
  shops: MarketplaceShop[];
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  let { data, error } = await supabase
    .from("public_marketplace_businesses")
    .select(MARKETPLACE_SHOP_SELECT)
    .order("business_name")
    .limit(limit);

  if (error) {
    const fallback = await supabase
      .from("public_business_listings")
      .select(MARKETPLACE_SHOP_SELECT)
      .order("business_name")
      .limit(limit);
    if (fallback.error) {
      const legacy = await supabase
        .from("public_business_listings")
        .select(
          "id, slug, business_name, description, location_text, public_location_label, latitude, longitude, logo_url, category_id, category_name, public_phone, public_whatsapp, opening_hours, is_verified, verification_status",
        )
        .order("business_name")
        .limit(limit);
      if (legacy.error) return { shops: [], error: legacy.error.message };
      data = legacy.data;
    } else {
      data = fallback.data;
    }
    error = null;
  }

  const rows = (data ?? []) as PublicBusiness[];
  const { data: productRows } = await supabase
    .from("public_business_products")
    .select("business_id, name")
    .limit(2000);

  const namesByBiz = new Map<string, string[]>();
  for (const row of productRows ?? []) {
    const list = namesByBiz.get(row.business_id as string) ?? [];
    list.push(row.name as string);
    namesByBiz.set(row.business_id as string, list);
  }

  return {
    shops: rows.map((b) => {
      const names = namesByBiz.get(b.id) ?? [];
      return { ...b, product_names: names, product_count: names.length };
    }),
    error: null,
  };
}

/** Informal shops with products near a map centre — for purchase discovery. */
export async function fetchNearbyMarketplaceShops(input: {
  lat: number;
  lng: number;
  radiusKm?: number;
  limit?: number;
}): Promise<{ shops: NearbyMarketplaceShop[]; error: string | null }> {
  const radiusKm = input.radiusKm ?? 25;
  const centre = { lat: input.lat, lng: input.lng };

  const [productsRes, listingsRes] = await Promise.all([
    fetchMarketplaceProducts(200),
    (async () => {
      const supabase = getSupabaseBrowserClient();
      return supabase
        .from("public_business_listings")
        .select(
          "id, slug, business_name, description, location_text, public_location_label, latitude, longitude, logo_url, category_id, category_name, public_phone, public_whatsapp, opening_hours, is_verified, verification_status, is_informal",
        )
        .limit(400);
    })(),
  ]);

  if (productsRes.error) return { shops: [], error: productsRes.error };
  if (listingsRes.error) return { shops: [], error: listingsRes.error.message };

  const productsByBiz = new Map<string, PublicProduct[]>();
  for (const p of productsRes.data) {
    const list = productsByBiz.get(p.business_id) ?? [];
    list.push(p);
    productsByBiz.set(p.business_id, list);
  }

  const shops: NearbyMarketplaceShop[] = [];
  for (const row of listingsRes.data ?? []) {
    const listing = row as PublicBusiness;
    if (listing.is_informal === false) continue;
    if (!productsByBiz.has(listing.id)) continue;
    if (typeof listing.latitude !== "number" || typeof listing.longitude !== "number") continue;
    const distance_km = haversineKm(centre, {
      lat: listing.latitude,
      lng: listing.longitude,
    });
    if (distance_km > radiusKm) continue;
    shops.push({
      ...listing,
      distance_km,
      products: productsByBiz.get(listing.id) ?? [],
    });
  }

  shops.sort((a, b) => a.distance_km - b.distance_km);
  return { shops: shops.slice(0, input.limit ?? 40), error: null };
}

export async function fetchMarketplaceProduct(productId: string): Promise<{
  product: PublicProduct | null;
  error: string | null;
}> {
  if (isMockFeedId(productId)) {
    return { product: null, error: "This listing is not available." };
  }

  const supabase = getSupabaseBrowserClient();
  let { data, error } = await supabase
    .from("public_business_products")
    .select(MARKETPLACE_PRODUCT_SELECT)
    .eq("id", productId)
    .maybeSingle();

  if (error) {
    const legacy = await supabase
      .from("public_business_products")
      .select(MARKETPLACE_PRODUCT_SELECT_LEGACY)
      .eq("id", productId)
      .maybeSingle();
    if (legacy.error) return { product: null, error: legacy.error.message };
    data = legacy.data;
    error = null;
  }

  if (error) return { product: null, error: error.message };
  if (!data) return { product: null, error: "This product is not available." };

  const product = data as PublicProduct;
  if (product.is_informal === false) {
    return { product: null, error: "This product is not available on the informal marketplace." };
  }

  if (!product.business_name || !product.business_slug) {
    const { data: listing } = await supabase
      .from("public_business_listings")
      .select("id, slug, business_name, is_informal")
      .eq("id", product.business_id)
      .maybeSingle();
    if (listing?.is_informal === false) {
      return { product: null, error: "This product is not available on the informal marketplace." };
    }
    const filled = await attachProductShopNames([
      {
        ...product,
        business_name: (listing?.business_name as string) ?? product.business_name,
        business_slug: (listing?.slug as string) ?? product.business_slug,
        is_informal: (listing?.is_informal as boolean | undefined) ?? product.is_informal ?? true,
      },
    ]);
    return { product: filled[0] ?? product, error: null };
  }

  const named = await attachProductShopNames([product]);
  return { product: named[0] ?? product, error: null };
}

function missingDbColumn(message: string | undefined, column: string): boolean {
  if (!message) return false;
  return new RegExp(`${column}|schema cache`, "i").test(message) && /schema cache|does not exist|column/i.test(message);
}

function shouldPlaceOrderDirectly(message: string | undefined): boolean {
  if (!message) return false;
  return missingDbColumn(message, "variant_id") || /insufficient stock/i.test(message);
}

async function getOrCreateActiveCart(profileId: string): Promise<{ cartId: string | null; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { data: existing } = await supabase
    .from("carts")
    .select("id")
    .eq("profile_id", profileId)
    .eq("status", "active")
    .maybeSingle();
  if (existing?.id) return { cartId: existing.id as string, error: null };

  const { data, error } = await supabase
    .from("carts")
    .insert({ profile_id: profileId, status: "active" })
    .select("id")
    .single();
  if (error) return { cartId: null, error: error.message };
  return { cartId: data.id as string, error: null };
}

async function fetchLiveCartItems(profileId: string): Promise<CartItem[] | null> {
  const { cartId, error: cartError } = await getOrCreateActiveCart(profileId);
  if (cartError || !cartId) return null;
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.from("cart_items").select("*").eq("cart_id", cartId).order("created_at");
  if (error) return null;
  return (data ?? []) as CartItem[];
}

export async function fetchCart(profileId: string): Promise<{
  items: CartItem[];
  error: string | null;
}> {
  const local = listLocalCart(profileId);
  if (!profileId || profileId === "guest") return { items: local, error: null };

  const live = await Promise.race([
    fetchLiveCartItems(profileId),
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 1800);
    }),
  ]);
  if (!live) return { items: local, error: null };
  const liveIds = new Set(live.map((i) => `${i.product_id}:${i.variant_id ?? ""}`));
  const extras = local.filter((i) => !liveIds.has(`${i.product_id}:${i.variant_id ?? ""}`));
  return { items: [...extras, ...live], error: null };
}

export async function addToCart(
  profileId: string,
  input: {
    businessId: string;
    productId: string;
    productName: string;
    unit: string;
    unitPrice: number;
    quantity?: number;
    imageUrl?: string | null;
    variantId?: string | null;
    variantLabel?: string | null;
  },
): Promise<{ error: string | null }> {
  if (isMockFeedId(input.productId)) {
    return { error: "This listing is not available." };
  }
  if (!profileId || profileId === "guest") {
    return { error: "Sign in to add items to your cart." };
  }
  addLocalCartItem(profileId, input);
  rememberSavedFromCart(profileId, input);
  const supabase = getSupabaseBrowserClient();
  const qty = input.quantity ?? 1;
  const rpcArgs: { p_product_id: string; p_quantity: number; p_variant_id?: string } = {
    p_product_id: input.productId,
    p_quantity: qty,
  };
  if (input.variantId) rpcArgs.p_variant_id = input.variantId;
  const rpc = await supabase.rpc("add_marketplace_cart_item", rpcArgs);
  if (!rpc.error) return { error: null };

  const { cartId, error: cartError } = await getOrCreateActiveCart(profileId);
  if (cartError || !cartId) return { error: cartError ?? "Could not open cart." };

  const live = await fetchMarketplaceProduct(input.productId);
  if (live.error) return { error: live.error };
  if (!live.product?.is_available) return { error: "This product is not available." };
  if (live.product.sale_price == null) return { error: "This listing has no price — send an enquiry instead." };

  const { data: existing } = await supabase
    .from("cart_items")
    .select("id, quantity")
    .eq("cart_id", cartId)
    .eq("product_id", input.productId)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from("cart_items")
      .update({
        quantity: Number(existing.quantity) + qty,
        unit_price: Number(live.product.sale_price),
        product_name: live.product.name,
      })
      .eq("id", existing.id);
    return { error: error?.message ?? null };
  }

  const { error } = await supabase.from("cart_items").insert({
    cart_id: cartId,
    business_id: live.product.business_id,
    product_id: input.productId,
    quantity: qty,
    unit_price: Number(live.product.sale_price),
    product_name: live.product.name,
    unit: live.product.unit,
    image_url: live.product.image_url ?? null,
  });
  if (error?.code === "23505") return { error: null };
  return { error: error?.message ?? null };
}

function rememberSavedFromCart(
  profileId: string,
  input: {
    businessId: string;
    productId: string;
    productName: string;
    unit: string;
    unitPrice: number;
    imageUrl?: string | null;
  },
) {
  ensureSavedProduct(
    profileId,
    {
      id: input.productId,
      business_id: input.businessId,
      name: input.productName,
      kind: "goods",
      description: null,
      sale_price: input.unitPrice,
      unit: input.unit,
      image_url: input.imageUrl ?? null,
      is_available: true,
    },
  );
}

export async function updateCartItemQuantity(
  itemId: string,
  quantity: number,
  profileId?: string | null,
): Promise<{ error: string | null }> {
  if (isLocalCartId(itemId) || !profileId || profileId === "guest") {
    updateLocalCartQuantity(itemId, quantity, profileId);
    return { error: null };
  }
  const supabase = getSupabaseBrowserClient();
  if (quantity <= 0) {
    const { error } = await supabase.from("cart_items").delete().eq("id", itemId);
    if (!error) updateLocalCartQuantity(itemId, 0, profileId);
    return { error: error?.message ?? null };
  }
  const { error } = await supabase.from("cart_items").update({ quantity }).eq("id", itemId);
  if (!error) updateLocalCartQuantity(itemId, quantity, profileId);
  return { error: error?.message ?? null };
}

export async function removeCartItem(itemId: string, profileId?: string | null): Promise<{ error: string | null }> {
  if (isLocalCartId(itemId) || !profileId || profileId === "guest") {
    removeLocalCartItem(itemId, profileId);
    return { error: null };
  }
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("cart_items").delete().eq("id", itemId);
  if (!error) removeLocalCartItem(itemId, profileId);
  return { error: error?.message ?? null };
}

export async function quoteCheckout(
  fulfilment: "pickup" | "seller_delivery" | "third_party",
): Promise<{ quote: CheckoutQuote | null; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("quote_marketplace_checkout", {
    p_fulfilment: fulfilment,
  });
  if (error) return { quote: null, error: error.message };
  return { quote: data as CheckoutQuote, error: null };
}

async function placeOrdersWithoutVariants(input: {
  fulfilment?: "pickup" | "seller_delivery" | "third_party";
  addressId?: string | null;
  buyerNote?: string;
  buyerPhone?: string;
  paymentMethod?: string | null;
  paymentDestination?: string | null;
}): Promise<{ orders: MarketplaceOrder[]; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { data: auth } = await supabase.auth.getUser();
  const profileId = auth.user?.id;
  if (!profileId) return { orders: [], error: "Sign in to place an order." };

  let items = (await fetchLiveCartItems(profileId)) ?? [];
  if (items.length === 0) {
    const local = listLocalCart(profileId);
    for (const line of local) {
      const added = await addToCart(profileId, {
        businessId: line.business_id,
        productId: line.product_id,
        productName: line.product_name,
        unit: line.unit,
        unitPrice: Number(line.unit_price),
        quantity: Number(line.quantity),
        imageUrl: line.image_url,
      });
      if (added.error && !missingDbColumn(added.error, "variant_id")) {
        return { orders: [], error: added.error };
      }
    }
    items = (await fetchLiveCartItems(profileId)) ?? local;
  }
  if (items.length === 0) return { orders: [], error: "Your cart is empty." };

  const byShop = new Map<string, CartItem[]>();
  for (const line of items) {
    const list = byShop.get(line.business_id) ?? [];
    list.push(line);
    byShop.set(line.business_id, list);
  }

  const orders: MarketplaceOrder[] = [];
  const delivery = input.fulfilment === "pickup" ? 0 : 500;
  for (const [businessId, lines] of byShop) {
    const subtotal = lines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unit_price), 0);
    const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, "");
    const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
    const { data: order, error } = await supabase
      .from("orders")
      .insert({
        order_number: `TJ-${stamp}-${suffix}`,
        buyer_profile_id: profileId,
        business_id: businessId,
        status: "pending_payment",
        fulfilment: input.fulfilment ?? "pickup",
        delivery_address_id: input.addressId ?? null,
        subtotal,
        delivery_fee: delivery,
        total: subtotal + delivery,
        buyer_phone: input.buyerPhone ?? null,
        buyer_note: input.buyerNote ?? null,
      })
      .select("*")
      .single();
    if (error || !order) return { orders, error: error?.message ?? "Could not create the order." };

    const { error: itemError } = await supabase.from("order_items").insert(
      lines.map((line) => ({
        order_id: order.id,
        product_id: line.product_id,
        product_name: line.product_name,
        unit: line.unit,
        quantity: line.quantity,
        unit_price: line.unit_price,
        line_total: Number(line.quantity) * Number(line.unit_price),
        image_url: line.image_url,
      })),
    );
    if (itemError) return { orders, error: itemError.message };

    await supabase.from("payments").insert({
      order_id: order.id,
      provider: "test",
      status: "initiated",
      amount: Number(order.total),
      test_mode: true,
    });
    orders.push(order as MarketplaceOrder);
  }

  const { cartId } = await getOrCreateActiveCart(profileId);
  if (cartId) {
    await supabase.from("carts").update({ status: "converted" }).eq("id", cartId);
  }
  return { orders, error: null };
}

export async function placeOrders(input: {
  fulfilment?: "pickup" | "seller_delivery" | "third_party";
  addressId?: string | null;
  buyerNote?: string;
  buyerPhone?: string;
  idempotencyKey: string;
  paymentMethod?: string | null;
  paymentDestination?: string | null;
}): Promise<{ orders: MarketplaceOrder[]; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const payload = {
    p_fulfilment: input.fulfilment ?? "pickup",
    p_address_id: input.addressId ?? null,
    p_buyer_note: input.buyerNote ?? null,
    p_buyer_phone: input.buyerPhone ?? null,
    p_idempotency_key: input.idempotencyKey,
  };
  let { data, error } = await supabase.rpc("place_marketplace_orders", payload);
  if (error && /p_idempotency_key|function.*place_marketplace_orders/i.test(error.message)) {
    const legacy = await supabase.rpc("place_marketplace_orders", {
      p_fulfilment: payload.p_fulfilment,
      p_address_id: payload.p_address_id,
      p_buyer_note: payload.p_buyer_note,
      p_buyer_phone: payload.p_buyer_phone,
    });
    data = legacy.data;
    error = legacy.error;
  }
  if (error && shouldPlaceOrderDirectly(error.message)) {
    const fallback = await placeOrdersWithoutVariants(input);
    if (fallback.error || fallback.orders.length === 0) {
      return { orders: [], error: fallback.error ?? error.message };
    }
    data = fallback.orders;
    error = null;
  }
  if (error) return { orders: [], error: error.message };
  const orders = (data ?? []) as MarketplaceOrder[];
  if (input.paymentMethod && orders.length > 0) {
    const supabasePay = getSupabaseBrowserClient();
    await Promise.all(
      orders.map((order) =>
        supabasePay
          .from("orders")
          .update({
            payment_method: input.paymentMethod,
            payment_destination: input.paymentDestination ?? null,
          })
          .eq("id", order.id),
      ),
    );
  }
  return { orders, error: null };
}

export async function transitionOrder(
  orderId: string,
  nextStatus: string,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("transition_marketplace_order", {
    p_order_id: orderId,
    p_new_status: nextStatus,
  });
  return { error: error?.message ?? null };
}

export async function markBuyerTransferPaid(orderId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("buyer_mark_transfer_paid", { p_order_id: orderId });
  return { error: error?.message ?? null };
}

/** Kept for older screens. Always refuses to mark paid from the client. */
export async function completeTestPayment(_orderId: string): Promise<{
  order: MarketplaceOrder | null;
  error: string | null;
}> {
  if (!isLivePaymentConfigured()) {
    return {
      order: null,
      error: "Payment is not live. This stays an order request until Paystack or Flutterwave is connected.",
    };
  }
  return { order: null, error: "Use the payment webhook — the app cannot mark an order paid." };
}

export async function fetchMyOrders(profileId?: string | null): Promise<{ orders: MarketplaceOrder[]; error: string | null }> {
  const local = listLocalOrders(profileId);
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return { orders: local, error: local.length ? null : error.message };
  const live = (data ?? []) as MarketplaceOrder[];
  const ids = new Set(live.map((o) => o.id));
  return { orders: [...local.filter((o) => !ids.has(o.id)), ...live], error: null };
}

export async function fetchOrderDetail(orderId: string, profileId?: string | null): Promise<{
  order: MarketplaceOrder | null;
  items: MarketplaceOrderItem[];
  error: string | null;
}> {
  const local = getLocalOrder(profileId, orderId) ?? getLocalOrder("guest", orderId);
  if (local) return { ...local, error: null };
  const supabase = getSupabaseBrowserClient();
  const { data: order, error } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (error) return { order: null, items: [], error: error.message };
  if (!order) return { order: null, items: [], error: null };
  const { data: items, error: iErr } = await supabase.from("order_items").select("*").eq("order_id", orderId);
  if (iErr) return { order: order as MarketplaceOrder, items: [], error: iErr.message };
  return { order: order as MarketplaceOrder, items: (items ?? []) as MarketplaceOrderItem[], error: null };
}

export async function listAddresses(profileId: string): Promise<{
  data: CustomerAddress[];
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("customer_addresses")
    .select("*")
    .eq("profile_id", profileId)
    .order("is_default", { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as CustomerAddress[], error: null };
}

export async function saveAddress(
  profileId: string,
  input: Omit<CustomerAddress, "id" | "profile_id"> & { id?: string },
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const row = {
    profile_id: profileId,
    label: input.label,
    full_name: input.full_name,
    phone: input.phone,
    state: input.state,
    city: input.city,
    lga: input.lga,
    street: input.street,
    instructions: input.instructions,
    is_default: input.is_default,
  };
  if (input.id) {
    const { error } = await supabase.from("customer_addresses").update(row).eq("id", input.id);
    return { error: error?.message ?? null };
  }
  const { error } = await supabase.from("customer_addresses").insert(row);
  return { error: error?.message ?? null };
}

export async function toggleFavoriteProduct(
  profileId: string,
  productId: string,
): Promise<{ favorited: boolean; error: string | null }> {
  if (isMockFeedId(productId)) {
    return { favorited: false, error: "This listing is not available." };
  }
  const supabase = getSupabaseBrowserClient();
  const { data: existing } = await supabase
    .from("marketplace_favorites")
    .select("id")
    .eq("profile_id", profileId)
    .eq("product_id", productId)
    .maybeSingle();
  if (existing?.id) {
    const { error } = await supabase.from("marketplace_favorites").delete().eq("id", existing.id);
    return { favorited: false, error: error?.message ?? null };
  }
  const { error } = await supabase.from("marketplace_favorites").insert({
    profile_id: profileId,
    product_id: productId,
  });
  return { favorited: true, error: error?.message ?? null };
}

export async function fetchFavoriteProducts(profileId: string): Promise<{
  products: PublicProduct[];
  error: string | null;
}> {
  const local = listSavedProducts(profileId);
  const supabase = getSupabaseBrowserClient();
  const { data: favs, error } = await supabase
    .from("marketplace_favorites")
    .select("product_id")
    .eq("profile_id", profileId)
    .not("product_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) return { products: local, error: local.length ? null : error.message };
  const ids = (favs ?? []).map((f) => f.product_id as string).filter(Boolean);
  if (ids.length === 0) return { products: local, error: null };

  const catalog = await fetchMarketplaceProducts(200);
  const byId = new Map((catalog.data ?? []).map((p) => [p.id, p]));
  const live = ids.map((id) => byId.get(id)).filter((p): p is PublicProduct => Boolean(p));
  const seen = new Set(live.map((p) => p.id));
  return { products: [...local.filter((p) => !seen.has(p.id)), ...live], error: null };
}

export async function countFavoriteProducts(profileId: string): Promise<number> {
  const local = listSavedProducts(profileId).length;
  try {
    const supabase = getSupabaseBrowserClient();
    const { count } = await supabase
      .from("marketplace_favorites")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profileId)
      .not("product_id", "is", null);
    return Math.max(local, count ?? 0);
  } catch {
    return local;
  }
}

export type BusinessUpgradeRequest = {
  id: string;
  profile_id: string;
  business_name: string;
  location: string | null;
  phone: string | null;
  note: string | null;
  description: string | null;
  category_id: string | null;
  shop_image_url: string | null;
  whatsapp: string | null;
  state: string | null;
  city: string | null;
  street: string | null;
  latitude: number | null;
  longitude: number | null;
  public_location_label: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

export async function fetchMyBusinessUpgradeRequest(profileId: string): Promise<{
  request: BusinessUpgradeRequest | null;
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("business_upgrade_requests")
    .select("*")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { request: null, error: error.message };
  return { request: (data as BusinessUpgradeRequest | null) ?? null, error: null };
}

export async function uploadUpgradeShopImage(
  profileId: string,
  file: File,
): Promise<{ publicUrl: string | null; error: string | null }> {
  if (!file.type.startsWith("image/")) {
    return { publicUrl: null, error: "Use a JPG, PNG, WEBP, or GIF photo." };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { publicUrl: null, error: "Photo is too large. Use an image under 5 MB." };
  }
  const supabase = getSupabaseBrowserClient();
  const extRaw = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const ext = ["jpg", "jpeg", "png", "webp", "gif"].includes(extRaw)
    ? extRaw === "jpeg"
      ? "jpg"
      : extRaw
    : "jpg";
  const path = `${profileId}/shop.${ext}`;
  const { error } = await supabase.storage.from("upgrade-shop-images").upload(path, file, {
    upsert: true,
    contentType: file.type || `image/${ext === "jpg" ? "jpeg" : ext}`,
  });
  if (error) {
    if (error.message.toLowerCase().includes("bucket not found")) {
      return {
        publicUrl: null,
        error: "Shop image storage is not set up yet. Apply migration 000015 in Supabase.",
      };
    }
    return { publicUrl: null, error: error.message };
  }
  const { data } = supabase.storage.from("upgrade-shop-images").getPublicUrl(path);
  return { publicUrl: data.publicUrl, error: null };
}

export async function requestBusinessUpgrade(input: {
  profileId: string;
  businessName: string;
  description: string;
  categoryId: string;
  location: string;
  street: string;
  city: string;
  state: string;
  phone: string;
  whatsapp?: string;
  shopImageUrl: string;
  latitude?: number | null;
  longitude?: number | null;
  publicLocationLabel?: string;
  note?: string;
}): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const phone = input.phone.trim();
  const { error } = await supabase.from("business_upgrade_requests").insert({
    profile_id: input.profileId,
    business_name: input.businessName.trim(),
    description: input.description.trim(),
    category_id: input.categoryId,
    location: input.location.trim(),
    street: input.street.trim(),
    city: input.city.trim(),
    state: input.state.trim(),
    phone,
    whatsapp: input.whatsapp?.trim() || null,
    shop_image_url: input.shopImageUrl,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    public_location_label: input.publicLocationLabel?.trim() || null,
    note: input.note?.trim() || null,
    status: "pending",
  });
  if (!error && phone) {
    await supabase.from("profiles").update({ phone }).eq("id", input.profileId).is("phone", null);
  }
  return { error: error?.message ?? null };
}

export async function setActiveMode(
  profileId: string,
  mode: "customer" | "business",
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("profiles").update({ active_mode: mode }).eq("id", profileId);
  return { error: error?.message ?? null };
}

export async function reportListing(input: {
  reporterId: string;
  businessId: string;
  reason: "spam" | "scam" | "hate" | "wrong_info" | "other";
  details?: string;
}): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("listing_reports").insert({
    reporter_id: input.reporterId,
    business_id: input.businessId,
    reason: input.reason,
    details: input.details?.trim() || null,
  });
  if (error?.code === "23505") return { error: "You already reported this shop." };
  return { error: error?.message ?? null };
}

export async function fetchMyEnquiries(profileId: string): Promise<{
  enquiries: Array<{
    id: string;
    business_id: string;
    message: string;
    created_at: string;
    customer_name: string;
  }>;
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("business_enquiries")
    .select("id, business_id, message, created_at, customer_name")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) return { enquiries: [], error: error.message };
  return { enquiries: data ?? [], error: null };
}

export async function fetchFollowedBusinesses(profileId: string): Promise<{
  shops: PublicBusiness[];
  error: string | null;
}> {
  const localShops = listFollowedShopsAsBusinesses(profileId);
  if (!profileId || profileId === "guest") return { shops: localShops, error: null };
  const supabase = getSupabaseBrowserClient();
  const { data: follows, error } = await supabase
    .from("business_follows")
    .select("business_id")
    .eq("profile_id", profileId);
  if (error) return { shops: localShops, error: localShops.length ? null : error.message };
  const ids = (follows ?? []).map((f) => f.business_id as string);
  if (ids.length === 0) return { shops: localShops, error: null };
  const { data, error: listError } = await supabase
    .from("public_business_listings")
    .select(MARKETPLACE_SHOP_SELECT)
    .in("id", ids);
  if (listError) return { shops: localShops, error: localShops.length ? null : listError.message };
  const live = (data ?? []) as PublicBusiness[];
  const seen = new Set(live.map((s) => s.id));
  return { shops: [...localShops.filter((s) => !seen.has(s.id)), ...live], error: null };
}

export async function fetchShopFollowers(
  businessId: string,
): Promise<{ people: ReturnType<typeof listShopFollowers>; error: string | null }> {
  const local = listShopFollowers(businessId);
  if (isMockFeedId(businessId)) return { people: [], error: null };
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("business_follows")
    .select("profile_id, created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return { people: local, error: local.length ? null : error.message };
  const ids = (data ?? []).map((r) => r.profile_id as string);
  if (ids.length === 0) return { people: local, error: null };
  const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", ids);
  const names = new Map((profiles ?? []).map((p) => [p.id as string, p.full_name as string]));
  const live = ids.map((id) => ({
    id,
    name: names.get(id) ?? "Shopper",
    handle: (names.get(id) ?? "shopper").replace(/[^a-zA-Z0-9]/g, "").toLowerCase(),
    kind: "person" as const,
  }));
  const seen = new Set(live.map((p) => p.id));
  return { people: [...live, ...local.filter((p) => !seen.has(p.id))], error: null };
}

export async function fetchNotificationPreferences(profileId: string): Promise<{
  prefs: NotificationPreferences;
  error: string | null;
}> {
  const fallback: NotificationPreferences = {
    profile_id: profileId,
    order_updates: true,
    enquiry_replies: true,
    followed_shops: true,
    marketing: false,
  };
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) return { prefs: fallback, error: error.message };
  return { prefs: (data as NotificationPreferences | null) ?? fallback, error: null };
}

export async function saveNotificationPreferences(
  prefs: NotificationPreferences,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("notification_preferences").upsert({
    ...prefs,
    updated_at: new Date().toISOString(),
  });
  return { error: error?.message ?? null };
}

function asPayoutAccount(row: Record<string, unknown>, businessId: string): import("@/types/database").BusinessPayoutAccount {
  return {
    business_id: (row.business_id as string | undefined) ?? (row.id as string | undefined) ?? businessId,
    business_name: (row.business_name as string) ?? "",
    payout_account_name: (row.payout_account_name as string | null) ?? null,
    payout_account_number: (row.payout_account_number as string | null) ?? null,
    payout_bank_name: (row.payout_bank_name as string | null) ?? null,
    payout_bank_code: (row.payout_bank_code as string | null) ?? null,
  };
}

export async function fetchBusinessPayoutAccount(businessId: string): Promise<{
  account: import("@/types/database").BusinessPayoutAccount | null;
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  const rpc = await supabase.rpc("get_business_payout_account", { p_business_id: businessId });
  const rpcRow = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
  if (!rpc.error && rpcRow) {
    return { account: asPayoutAccount(rpcRow as Record<string, unknown>, businessId), error: null };
  }
  const view = await supabase.from("public_business_payout_accounts").select("*").eq("business_id", businessId).maybeSingle();
  if (!view.error && view.data) {
    return { account: asPayoutAccount(view.data as Record<string, unknown>, businessId), error: null };
  }
  const fallback = await supabase
    .from("businesses")
    .select("id, business_name, payout_account_name, payout_account_number, payout_bank_name, payout_bank_code")
    .eq("id", businessId)
    .maybeSingle();
  if (fallback.data?.payout_account_number) {
    return { account: asPayoutAccount(fallback.data as Record<string, unknown>, businessId), error: null };
  }
  return { account: null, error: null };
}

export async function saveBusinessPayoutAccount(
  businessId: string,
  input: {
    payout_account_name: string;
    payout_account_number: string;
    payout_bank_name: string;
    payout_bank_code: string;
  },
  profileId?: string | null,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const name = input.payout_account_name.trim();
  const number = input.payout_account_number.replace(/\D/g, "");
  if (name.length < 2) return { error: "Enter the account name." };
  if (number.length < 8 || number.length > 12) return { error: "Enter a valid account number (8–12 digits)." };

  if (profileId) {
    await ensureOwnerMembership(businessId, profileId);
  } else {
    const { data: sessionData } = await supabase.auth.getUser();
    const authId = sessionData.user?.id;
    if (authId) {
      const profile = await supabase.from("profiles").select("id").eq("auth_id", authId).maybeSingle();
      if (profile.data?.id) await ensureOwnerMembership(businessId, profile.data.id as string);
    }
  }

  const rpc = await supabase.rpc("save_business_payout_account", {
    p_business_id: businessId,
    p_account_name: name,
    p_account_number: number,
    p_bank_name: input.payout_bank_name.trim(),
    p_bank_code: input.payout_bank_code.trim(),
  });
  if (!rpc.error) return { error: null };

  const { data, error } = await supabase
    .from("businesses")
    .update({
      payout_account_name: name,
      payout_account_number: number,
      payout_bank_name: input.payout_bank_name.trim(),
      payout_bank_code: input.payout_bank_code.trim(),
    })
    .eq("id", businessId)
    .select("id")
    .maybeSingle();
  if (!error && data?.id) return { error: null };

  const message = error?.message ?? rpc.error.message;
  if (/schema cache|column|payout_account/i.test(message)) {
    return { error: "Bank account is not set up on the database yet. Run migration 000033 in Supabase, then save again." };
  }
  if (/not allowed|row-level security|permission/i.test(message)) {
    return { error: "Could not save this shop’s bank account. Sign in as the shop owner and try again." };
  }
  return { error: message };
}

export async function fetchSellerWallet(businessId: string): Promise<{
  wallet: import("@/types/database").SellerWallet;
  requests: import("@/types/database").PayoutRequest[];
  error: string | null;
}> {
  const empty = { business_id: businessId, available_ngn: 0, pending_ngn: 0 };
  const supabase = getSupabaseBrowserClient();
  const walletRes = await supabase.from("seller_wallets").select("*").eq("business_id", businessId).maybeSingle();
  const reqRes = await supabase
    .from("payout_requests")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(20);
  return {
    wallet: (walletRes.data as import("@/types/database").SellerWallet | null) ?? empty,
    requests: (reqRes.data ?? []) as import("@/types/database").PayoutRequest[],
    error: walletRes.error?.message ?? reqRes.error?.message ?? null,
  };
}

export async function startFlutterwavePay(orderId: string): Promise<{ link: string | null; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return { link: null, error: "Sign in to pay online." };
  const res = await fetch("/api/payments/flutterwave", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ orderId }),
  });
  const json = (await res.json()) as { link?: string; error?: string };
  if (!res.ok) return { link: null, error: json.error ?? "Could not open Flutterwave." };
  return { link: json.link ?? null, error: json.link ? null : "Could not open Flutterwave." };
}

export async function requestSellerPayout(
  businessId: string,
  amount: number,
): Promise<{ error: string | null; message?: string }> {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return { error: "Sign in first." };
  const res = await fetch("/api/payments/payout", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ businessId, amount }),
  });
  const json = (await res.json()) as { error?: string; message?: string };
  if (!res.ok) return { error: json.error ?? "Payout failed." };
  return { error: null, message: json.message };
}
