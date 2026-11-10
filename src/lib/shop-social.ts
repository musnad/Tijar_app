import type { CartItem, MarketplaceOrder, MarketplaceOrderItem, PublicBusiness, PublicProduct } from "@/types/database";

export type SocialPerson = {
  id: string;
  name: string;
  handle: string;
  avatarUrl?: string | null;
  kind: "person" | "shop";
};

export const MOCK_PEOPLE: SocialPerson[] = [];

const USER_PREFIX = "tijar-social-user-";
const SHOP_FOLLOWERS_KEY = "tijar-social-shop-followers";
const PEOPLE_FOLLOWERS_KEY = "tijar-social-people-followers";

type UserSocial = {
  likedProducts: string[];
  savedProducts: PublicProduct[];
  likedVideos: string[];
  followedShops: string[];
  followedPeople: string[];
  orders: MarketplaceOrder[];
  orderItems: Record<string, MarketplaceOrderItem[]>;
};

function emptyUser(): UserSocial {
  return {
    likedProducts: [],
    savedProducts: [],
    likedVideos: [],
    followedShops: [],
    followedPeople: [],
    orders: [],
    orderItems: {},
  };
}

function userKey(profileId: string | null | undefined): string {
  return `${USER_PREFIX}${profileId?.trim() || "guest"}`;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function loadUserSocial(profileId: string | null | undefined): UserSocial {
  const parsed = readJson<Partial<UserSocial>>(userKey(profileId), {});
  return { ...emptyUser(), ...parsed, orderItems: parsed.orderItems ?? {}, savedProducts: parsed.savedProducts ?? [] };
}

function saveUserSocial(profileId: string | null | undefined, next: UserSocial) {
  writeJson(userKey(profileId), next);
}

function patchUser(profileId: string | null | undefined, fn: (cur: UserSocial) => UserSocial): UserSocial {
  const next = fn(loadUserSocial(profileId));
  saveUserSocial(profileId, next);
  return next;
}

export function isProductLiked(profileId: string | null | undefined, productId: string): boolean {
  return loadUserSocial(profileId).likedProducts.includes(productId);
}

export function likeProduct(profileId: string | null | undefined, productId: string): boolean {
  const already = isProductLiked(profileId, productId);
  if (already) return true;
  patchUser(profileId, (cur) => ({ ...cur, likedProducts: [...cur.likedProducts, productId] }));
  return true;
}

export function toggleProductLike(profileId: string | null | undefined, productId: string): boolean {
  const liked = isProductLiked(profileId, productId);
  patchUser(profileId, (cur) => ({
    ...cur,
    likedProducts: liked ? cur.likedProducts.filter((id) => id !== productId) : [...cur.likedProducts, productId],
  }));
  return !liked;
}

export function listSavedProducts(profileId: string | null | undefined): PublicProduct[] {
  return loadUserSocial(profileId).savedProducts;
}

export function isProductSaved(profileId: string | null | undefined, productId: string): boolean {
  return loadUserSocial(profileId).savedProducts.some((p) => p.id === productId);
}

export function ensureSavedProduct(profileId: string | null | undefined, product: PublicProduct): boolean {
  if (isProductSaved(profileId, product.id)) return true;
  patchUser(profileId, (cur) => ({ ...cur, savedProducts: [product, ...cur.savedProducts] }));
  return true;
}

export function toggleSavedProduct(profileId: string | null | undefined, product: PublicProduct): boolean {
  const saved = isProductSaved(profileId, product.id);
  patchUser(profileId, (cur) => ({
    ...cur,
    savedProducts: saved ? cur.savedProducts.filter((p) => p.id !== product.id) : [product, ...cur.savedProducts],
  }));
  return !saved;
}

export function isVideoLiked(profileId: string | null | undefined, videoId: string): boolean {
  return loadUserSocial(profileId).likedVideos.includes(videoId);
}

export function toggleVideoLikeLocal(profileId: string | null | undefined, videoId: string): boolean {
  const liked = isVideoLiked(profileId, videoId);
  patchUser(profileId, (cur) => ({
    ...cur,
    likedVideos: liked ? cur.likedVideos.filter((id) => id !== videoId) : [...cur.likedVideos, videoId],
  }));
  return !liked;
}

export function likeVideoLocal(profileId: string | null | undefined, videoId: string): boolean {
  if (isVideoLiked(profileId, videoId)) return true;
  patchUser(profileId, (cur) => ({ ...cur, likedVideos: [...cur.likedVideos, videoId] }));
  return true;
}

type FollowerRow = SocialPerson;

function shopFollowersMap(): Record<string, FollowerRow[]> {
  return readJson<Record<string, FollowerRow[]>>(SHOP_FOLLOWERS_KEY, {});
}

function peopleFollowersMap(): Record<string, FollowerRow[]> {
  return readJson<Record<string, FollowerRow[]>>(PEOPLE_FOLLOWERS_KEY, {});
}

function currentPerson(profileId: string | null | undefined, name?: string | null): FollowerRow {
  if (!profileId || profileId === "guest") {
    return { id: "guest", name: name?.trim() || "Guest shopper", handle: "guest", kind: "person" };
  }
  return {
    id: profileId,
    name: name?.trim() || "TIJAR member",
    handle: (name ?? "member").replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "member",
    kind: "person",
  };
}

export function isFollowingShop(profileId: string | null | undefined, businessId: string): boolean {
  return loadUserSocial(profileId).followedShops.includes(businessId);
}

export function toggleFollowShopLocal(
  profileId: string | null | undefined,
  businessId: string,
  actor?: { name?: string | null },
): boolean {
  const following = isFollowingShop(profileId, businessId);
  patchUser(profileId, (cur) => ({
    ...cur,
    followedShops: following ? cur.followedShops.filter((id) => id !== businessId) : [...cur.followedShops, businessId],
  }));
  const map = shopFollowersMap();
  const list = map[businessId] ?? [];
  const me = currentPerson(profileId, actor?.name);
  map[businessId] = following ? list.filter((p) => p.id !== me.id) : [me, ...list.filter((p) => p.id !== me.id)];
  writeJson(SHOP_FOLLOWERS_KEY, map);
  return !following;
}

export function listFollowedShopIds(profileId: string | null | undefined): string[] {
  return loadUserSocial(profileId).followedShops;
}

export function listShopFollowers(businessId: string): FollowerRow[] {
  return shopFollowersMap()[businessId] ?? [];
}

export function isFollowingPerson(profileId: string | null | undefined, personId: string): boolean {
  return loadUserSocial(profileId).followedPeople.includes(personId);
}

export function toggleFollowPersonLocal(
  profileId: string | null | undefined,
  person: SocialPerson,
  actor?: { name?: string | null },
): boolean {
  if (profileId && person.id === profileId) return false;
  const following = isFollowingPerson(profileId, person.id);
  patchUser(profileId, (cur) => ({
    ...cur,
    followedPeople: following ? cur.followedPeople.filter((id) => id !== person.id) : [...cur.followedPeople, person.id],
  }));
  const map = peopleFollowersMap();
  const list = map[person.id] ?? [];
  const me = currentPerson(profileId, actor?.name);
  map[person.id] = following ? list.filter((p) => p.id !== me.id) : [me, ...list.filter((p) => p.id !== me.id)];
  writeJson(PEOPLE_FOLLOWERS_KEY, map);
  return !following;
}

export function listFollowedPeople(profileId: string | null | undefined): SocialPerson[] {
  const ids = loadUserSocial(profileId).followedPeople;
  return ids
    .filter((id) => !id.startsWith("mock-"))
    .map((id) => ({ id, name: "Member", handle: "member", kind: "person" as const }));
}

export function listPeopleFollowers(profileId: string | null | undefined): FollowerRow[] {
  if (!profileId) return [];
  return peopleFollowersMap()[profileId] ?? [];
}

export function listFollowedShopsAsBusinesses(_profileId: string | null | undefined): PublicBusiness[] {
  return [];
}

export function listLocalOrders(profileId: string | null | undefined): MarketplaceOrder[] {
  return loadUserSocial(profileId).orders.filter((o) => !o.id.startsWith("mock-"));
}

export function getLocalOrder(
  profileId: string | null | undefined,
  orderId: string,
): { order: MarketplaceOrder; items: MarketplaceOrderItem[] } | null {
  if (orderId.startsWith("mock-")) return null;
  const user = loadUserSocial(profileId);
  const order = user.orders.find((o) => o.id === orderId);
  if (order) return { order, items: user.orderItems[orderId] ?? [] };
  if (profileId) {
    const guest = loadUserSocial("guest");
    const g = guest.orders.find((o) => o.id === orderId);
    if (g) return { order: g, items: guest.orderItems[orderId] ?? [] };
  }
  return null;
}

export function placeLocalOrder(input: {
  profileId: string | null | undefined;
  product: PublicProduct;
  quantity: number;
  fulfilment: "pickup" | "seller_delivery";
  buyerPhone?: string;
  buyerNote?: string;
}): { order: MarketplaceOrder; items: MarketplaceOrderItem[] } {
  const qty = Math.max(1, input.quantity);
  const unit = Number(input.product.sale_price ?? 0);
  const subtotal = unit * qty;
  const delivery = 0;
  const id = `mock-order-${crypto.randomUUID()}`;
  const order: MarketplaceOrder = {
    id,
    order_number: `TJ-${Date.now().toString().slice(-8)}`,
    buyer_profile_id: input.profileId ?? "guest",
    business_id: input.product.business_id,
    status: "confirmed",
    fulfilment: input.fulfilment,
    subtotal,
    delivery_fee: delivery,
    payment_fee: 0,
    total: subtotal + delivery,
    currency: "NGN",
    buyer_phone: input.buyerPhone ?? null,
    buyer_note: input.buyerNote ?? null,
    is_order_request: true,
    created_at: new Date().toISOString(),
  };
  const items: MarketplaceOrderItem[] = [
    {
      id: `${id}-item`,
      order_id: id,
      product_id: input.product.id,
      product_name: input.product.name,
      unit: input.product.unit,
      quantity: qty,
      unit_price: unit,
      line_total: subtotal,
      image_url: input.product.image_url,
    },
  ];
  patchUser(input.profileId, (cur) => ({
    ...cur,
    orders: [order, ...cur.orders],
    orderItems: { ...cur.orderItems, [id]: items },
  }));
  return { order, items };
}

export function placeLocalCartOrder(input: {
  profileId: string | null | undefined;
  items: CartItem[];
  fulfilment: "pickup" | "seller_delivery";
  buyerPhone?: string;
  buyerNote?: string;
  subtotal: number;
  deliveryFee: number;
  tax: number;
  total: number;
}): { order: MarketplaceOrder; items: MarketplaceOrderItem[] } {
  const first = input.items[0];
  const id = `mock-order-${crypto.randomUUID()}`;
  const order: MarketplaceOrder = {
    id,
    order_number: `TJ-${Date.now().toString().slice(-8)}`,
    buyer_profile_id: input.profileId ?? "guest",
    business_id: first?.business_id ?? "unknown",
    status: "confirmed",
    fulfilment: input.fulfilment,
    subtotal: input.subtotal,
    delivery_fee: input.deliveryFee,
    payment_fee: input.tax,
    total: input.total,
    currency: "NGN",
    buyer_phone: input.buyerPhone ?? null,
    buyer_note: input.buyerNote ?? null,
    is_order_request: true,
    created_at: new Date().toISOString(),
  };
  const items: MarketplaceOrderItem[] = input.items.map((i, idx) => ({
    id: `${id}-item-${idx}`,
    order_id: id,
    product_id: i.product_id,
    product_name: i.product_name,
    unit: i.unit,
    quantity: Number(i.quantity),
    unit_price: Number(i.unit_price),
    line_total: Number(i.quantity) * Number(i.unit_price),
    image_url: i.image_url,
    variant_label: i.variant_label,
  }));
  patchUser(input.profileId, (cur) => ({
    ...cur,
    orders: [order, ...cur.orders],
    orderItems: { ...cur.orderItems, [id]: items },
  }));
  return { order, items };
}
