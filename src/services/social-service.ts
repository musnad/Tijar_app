import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { toggleFollowPersonLocal, type SocialPerson } from "@/lib/shop-social";
import { displayShopName, shopLinkSlug } from "@/lib/shop-names";
import { isMockFeedId } from "@/features/marketplace/feed-mock";

export type SocialConnection = {
  profileId: string;
  name: string;
  handle: string;
  avatarUrl: string | null;
  shopId: string | null;
  shopName: string | null;
  shopSlug: string | null;
  followingThem: boolean;
  theyFollowYou: boolean;
  source: "shop" | "person";
};

export type ActivityNotificationKind =
  | "follow"
  | "follow_back"
  | "comment"
  | "comment_reply"
  | "like"
  | "cart"
  | "purchase"
  | "place_order"
  | "place_order_paid";

export type ActivityNotification = {
  id: string;
  kind: ActivityNotificationKind;
  href?: string | undefined;
  title: string;
  body: string;
  businessId: string | null;
  videoPostId: string | null;
  actorId: string | null;
  actorName: string | null;
  actorAvatar: string | null;
  readAt: string | null;
  createdAt: string;
};

function handleFromName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "member";
}

function asPerson(row: {
  id: string;
  full_name?: string | null;
  avatar_url?: string | null;
}): SocialPerson {
  const name = row.full_name?.trim() || "TIJAR member";
  return {
    id: row.id,
    name,
    handle: handleFromName(name),
    avatarUrl: row.avatar_url ?? null,
    kind: "person",
  };
}

export async function toggleFollowPerson(
  profileId: string,
  person: SocialPerson,
): Promise<{ following: boolean; error: string | null }> {
  if (!profileId || profileId === "guest") return { following: false, error: "Sign in to follow people." };
  if (person.id === profileId) return { following: false, error: "You already have this profile." };
  const supabase = getSupabaseBrowserClient();
  const { data: existing } = await supabase
    .from("profile_follows")
    .select("follower_id")
    .eq("follower_id", profileId)
    .eq("followee_id", person.id)
    .maybeSingle();
  if (existing) {
    const { error } = await supabase
      .from("profile_follows")
      .delete()
      .eq("follower_id", profileId)
      .eq("followee_id", person.id);
    if (!error) toggleFollowPersonLocal(profileId, person);
    return { following: false, error: error?.message ?? null };
  }
  const { error } = await supabase.from("profile_follows").insert({
    follower_id: profileId,
    followee_id: person.id,
  });
  if (!error) toggleFollowPersonLocal(profileId, person);
  return { following: true, error: error?.message ?? null };
}

async function shopsByOwner(ownerIds: string[]) {
  if (ownerIds.length === 0) return new Map<string, { id: string; business_name: string; public_slug: string | null }>();
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase
    .from("businesses")
    .select("id, owner_id, business_name, public_slug")
    .in("owner_id", ownerIds);
  const map = new Map<string, { id: string; business_name: string; public_slug: string | null }>();
  for (const row of data ?? []) {
    if (!map.has(row.owner_id as string)) {
      map.set(row.owner_id as string, {
        id: row.id as string,
        business_name: row.business_name as string,
        public_slug: (row.public_slug as string | null) ?? null,
      });
    }
  }
  return map;
}

async function myFollowedShopOwnerIds(profileId: string): Promise<Set<string>> {
  const supabase = getSupabaseBrowserClient();
  const { data: follows } = await supabase.from("business_follows").select("business_id").eq("profile_id", profileId);
  const ids = (follows ?? []).map((r) => r.business_id as string);
  if (ids.length === 0) return new Set();
  const { data: shops } = await supabase.from("businesses").select("id, owner_id").in("id", ids);
  return new Set((shops ?? []).map((s) => s.owner_id as string));
}

async function myFollowedPeopleIds(profileId: string): Promise<Set<string>> {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.from("profile_follows").select("followee_id").eq("follower_id", profileId);
  return new Set((data ?? []).map((r) => r.followee_id as string));
}

export async function fetchPeopleIFollow(profileId: string): Promise<{ people: SocialConnection[]; error: string | null }> {
  try {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("profile_follows")
    .select("followee_id, created_at")
    .eq("follower_id", profileId)
    .order("created_at", { ascending: false });
  if (error) return { people: [], error: error.message };
  const ids = (data ?? []).map((r) => r.followee_id as string);
  if (ids.length === 0) return { people: [], error: null };
  const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids);
  const shops = await shopsByOwner(ids);
  const theyFollow = await supabase.from("profile_follows").select("follower_id").eq("followee_id", profileId).in("follower_id", ids);
  const they = new Set((theyFollow.data ?? []).map((r) => r.follower_id as string));
  const people = (profiles ?? []).map((p) => {
    const person = asPerson({ id: p.id as string, full_name: p.full_name as string, avatar_url: p.avatar_url as string | null });
    const shop = shops.get(person.id);
    return {
      profileId: person.id,
      name: person.name,
      handle: person.handle,
      avatarUrl: person.avatarUrl ?? null,
      shopId: shop?.id ?? null,
      shopName: shop ? displayShopName(shop.business_name) : null,
      shopSlug: shop ? shopLinkSlug(shop.public_slug, shop.id) : null,
      followingThem: true,
      theyFollowYou: they.has(person.id),
      source: "person" as const,
    };
  });
  return { people, error: null };
  } catch (err) {
    return { people: [], error: err instanceof Error ? err.message : "Could not load people you follow." };
  }
}

export async function fetchFollowersForMe(profileId: string): Promise<{
  people: SocialConnection[];
  error: string | null;
}> {
  try {
  const supabase = getSupabaseBrowserClient();
  const { data: myShops } = await supabase.from("businesses").select("id, business_name").eq("owner_id", profileId);
  const shopIds = (myShops ?? []).map((s) => s.id as string);

  const shopFollows =
    shopIds.length === 0
      ? { data: [] as Array<{ profile_id: string; business_id: string }>, error: null }
      : await supabase
          .from("business_follows")
          .select("profile_id, business_id, created_at")
          .in("business_id", shopIds)
          .order("created_at", { ascending: false })
          .limit(400);

  const peopleFollows = await supabase
    .from("profile_follows")
    .select("follower_id, created_at")
    .eq("followee_id", profileId)
    .order("created_at", { ascending: false })
    .limit(400);

  const ids = [
    ...new Set([
      ...((shopFollows.data ?? []).map((r) => r.profile_id as string)),
      ...((peopleFollows.data ?? []).map((r) => r.follower_id as string)),
    ]),
  ].filter((id) => id && id !== profileId);

  if (ids.length === 0) return { people: [], error: null };

  const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids);
  const shops = await shopsByOwner(ids);
  const followingPeople = await myFollowedPeopleIds(profileId);
  const followingShopOwners = await myFollowedShopOwnerIds(profileId);
  const shopFollowerIds = new Set((shopFollows.data ?? []).map((r) => r.profile_id as string));

  const people = ids.map((id) => {
    const row = (profiles ?? []).find((p) => p.id === id);
    const person = asPerson({
      id,
      full_name: (row?.full_name as string | null) ?? "Shopper",
      avatar_url: (row?.avatar_url as string | null) ?? null,
    });
    const shop = shops.get(id);
    return {
      profileId: id,
      name: person.name,
      handle: person.handle,
      avatarUrl: person.avatarUrl ?? null,
      shopId: shop?.id ?? null,
      shopName: shop ? displayShopName(shop.business_name) : null,
      shopSlug: shop ? shopLinkSlug(shop.public_slug, shop.id) : null,
      followingThem: followingPeople.has(id) || followingShopOwners.has(id),
      theyFollowYou: true,
      source: shopFollowerIds.has(id) ? ("shop" as const) : ("person" as const),
    };
  });
  return { people, error: null };
  } catch (err) {
    return { people: [], error: err instanceof Error ? err.message : "Could not load followers." };
  }
}

export async function followBack(profileId: string, person: SocialConnection): Promise<{ following: boolean; error: string | null }> {
  const target = {
    id: person.profileId,
    name: person.name,
    handle: person.handle,
    avatarUrl: person.avatarUrl,
    kind: "person" as const,
  };
  if (person.followingThem) {
    if (person.shopId && !isMockFeedId(person.shopId)) {
      const { toggleFollowBusiness } = await import("@/services/video-feed-service");
      const shop = await toggleFollowBusiness(profileId, person.shopId, person.name);
      if (shop.error) return shop;
    }
    return toggleFollowPerson(profileId, target);
  }
  const supabase = getSupabaseBrowserClient();
  if (person.shopId && !isMockFeedId(person.shopId)) {
    const { error } = await supabase
      .from("business_follows")
      .insert({ profile_id: profileId, business_id: person.shopId });
    if (error && error.code !== "23505") return { following: false, error: error.message };
  }
  const { error } = await supabase.from("profile_follows").insert({
    follower_id: profileId,
    followee_id: person.profileId,
  });
  if (error && error.code !== "23505") return { following: false, error: error.message };
  toggleFollowPersonLocal(profileId, target);
  return { following: true, error: null };
}

export async function fetchActivityNotifications(profileId: string): Promise<{
  items: ActivityNotification[];
  unread: number;
  error: string | null;
}> {
  try {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("activity_notifications")
    .select("id, kind, title, body, business_id, video_post_id, actor_id, read_at, created_at")
    .eq("recipient_id", profileId)
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) return { items: [], unread: 0, error: error.message };
  const rows = data ?? [];
  const actorIds = [...new Set(rows.map((r) => r.actor_id as string | null).filter(Boolean))] as string[];
  const { data: actors } =
    actorIds.length > 0
      ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", actorIds)
      : { data: [] };
  const names = new Map((actors ?? []).map((p) => [p.id as string, p]));
  const items: ActivityNotification[] = rows.map((r) => {
    const actor = names.get(r.actor_id as string);
    return {
      id: r.id as string,
      kind: r.kind as ActivityNotification["kind"],
      title: r.title as string,
      body: r.body as string,
      href:
        r.kind === "place_order" ||
        r.kind === "place_order_paid" ||
        r.kind === "cart" ||
        r.kind === "purchase" ||
        String(r.title).startsWith("Pending") ||
        String(r.title).startsWith("Paid")
          ? "/shop/create-order?tab=orders"
          : undefined,
      businessId: (r.business_id as string | null) ?? null,
      videoPostId: (r.video_post_id as string | null) ?? null,
      actorId: (r.actor_id as string | null) ?? null,
      actorName: (actor?.full_name as string | null) ?? null,
      actorAvatar: (actor?.avatar_url as string | null) ?? null,
      readAt: (r.read_at as string | null) ?? null,
      createdAt: r.created_at as string,
    };
  });
  return { items, unread: items.filter((i) => !i.readAt).length, error: null };
  } catch (err) {
    return { items: [], unread: 0, error: err instanceof Error ? err.message : "Could not load notifications." };
  }
}

export async function markNotificationsRead(profileId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from("activity_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", profileId)
    .is("read_at", null);
  return { error: error?.message ?? null };
}
