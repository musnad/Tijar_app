import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { displayShopName, shopLinkSlug, shopUsername } from "@/lib/shop-names";
import type { PublicProduct } from "@/types/database";
import type { PublicFeedVideo } from "@/services/video-feed-service";
import { fetchPostsForBusiness } from "@/services/video-feed-service";

export type PublicPerson = {
  id: string;
  fullName: string;
  handle: string;
  avatarUrl: string | null;
  bio: string | null;
  joinedAt: string | null;
  shopId: string | null;
  shopName: string | null;
  shopSlug: string | null;
  verifiedBadge: boolean;
};

export type PublicFollower = {
  id: string;
  name: string;
  handle: string;
  avatarUrl: string | null;
  shopSlug: string | null;
};

type ShopRow = {
  id: string;
  owner_id?: string;
  business_name: string;
  public_slug: string | null;
  logo_url: string | null;
  verified_badge?: boolean;
};

type ProfileRow = {
  id: string;
  full_name?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  created_at?: string | null;
};

const PRODUCT_SELECT =
  "id, business_id, name, description, sale_price, image_url, extra_image_urls, video_url, is_available, created_at, business_name, business_slug, business_logo_url, category_name";

async function shopsByOwner(ownerIds: string[]): Promise<Map<string, ShopRow>> {
  const map = new Map<string, ShopRow>();
  if (ownerIds.length === 0) return map;
  const supabase = getSupabaseBrowserClient();
  const view = await supabase
    .from("public_profile_shops")
    .select("id, owner_id, business_name, public_slug, logo_url, verified_badge")
    .in("owner_id", ownerIds);
  if (!view.error) {
    for (const row of (view.data ?? []) as ShopRow[]) {
      if (row.owner_id && !map.has(row.owner_id)) map.set(row.owner_id, row);
    }
    return map;
  }
  const live = await supabase
    .from("businesses")
    .select("id, owner_id, business_name, public_slug, logo_url, verified_badge")
    .in("owner_id", ownerIds)
    .order("created_at", { ascending: true });
  for (const row of (live.data ?? []) as ShopRow[]) {
    if (row.owner_id && !map.has(row.owner_id)) map.set(row.owner_id, row);
  }
  return map;
}

function asPerson(row: ProfileRow, shop: ShopRow | null | undefined): PublicPerson {
  const name = row.full_name?.trim() || shop?.business_name?.trim() || "TIJAR member";
  return {
    id: row.id,
    fullName: name,
    handle: shop ? shopUsername(shop.business_name, shop.public_slug) : shopUsername(name),
    avatarUrl: shop?.logo_url ?? row.avatar_url ?? null,
    bio: row.bio ?? null,
    joinedAt: row.created_at ?? null,
    shopId: shop?.id ?? null,
    shopName: shop ? displayShopName(shop.business_name) : null,
    shopSlug: shop ? shopLinkSlug(shop.public_slug, shop.id) : null,
    verifiedBadge: Boolean(shop?.verified_badge),
  };
}

export async function fetchPublicPerson(profileId: string): Promise<{ person: PublicPerson | null; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const shops = await shopsByOwner([profileId]);
  const shop = shops.get(profileId) ?? null;
  const view = await supabase
    .from("public_profiles")
    .select("id, full_name, avatar_url, bio, created_at")
    .eq("id", profileId)
    .maybeSingle();
  if (view.data) return { person: asPerson(view.data as ProfileRow, shop), error: null };
  const raw = await supabase.from("profiles").select("id, full_name, avatar_url, bio, created_at").eq("id", profileId).maybeSingle();
  if (raw.data) return { person: asPerson(raw.data as ProfileRow, shop), error: null };
  if (shop) return { person: asPerson({ id: profileId, full_name: shop.business_name, avatar_url: shop.logo_url }, shop), error: null };
  return { person: null, error: view.error?.message ?? raw.error?.message ?? "Profile not found" };
}

export async function searchPublicPeople(query: string): Promise<{ people: PublicPerson[]; error: string | null }> {
  const needle = query.trim();
  const supabase = getSupabaseBrowserClient();
  let q = supabase.from("public_profiles").select("id, full_name, avatar_url, bio, created_at").order("full_name").limit(40);
  if (needle) q = q.ilike("full_name", `%${needle}%`);
  const { data, error } = await q;
  let rows = ((data ?? []) as ProfileRow[]) ?? [];

  if (needle) {
    const shopHit = await supabase
      .from("public_profile_shops")
      .select("id, owner_id, business_name, public_slug, logo_url, verified_badge")
      .or(`business_name.ilike.%${needle}%,public_slug.ilike.%${needle}%`)
      .limit(40);
    const extraIds = ((shopHit.data ?? []) as ShopRow[])
      .map((s) => s.owner_id)
      .filter((id): id is string => Boolean(id) && !rows.some((r) => r.id === id));
    if (extraIds.length > 0) {
      const extra = await supabase.from("public_profiles").select("id, full_name, avatar_url, bio, created_at").in("id", extraIds);
      rows = [...rows, ...((extra.data ?? []) as ProfileRow[])];
      for (const s of (shopHit.data ?? []) as ShopRow[]) {
        if (s.owner_id && !rows.some((r) => r.id === s.owner_id)) {
          rows.push({ id: s.owner_id, full_name: s.business_name, avatar_url: s.logo_url, bio: null });
        }
      }
    }
  }

  if (error && rows.length === 0) {
    const shops = await supabase
      .from("public_marketplace_businesses")
      .select("id, slug, business_name, logo_url, is_verified")
      .ilike("business_name", needle ? `%${needle}%` : "%")
      .limit(40);
    const fromShops = ((shops.data ?? []) as Array<{
      id: string;
      slug: string | null;
      business_name: string;
      logo_url: string | null;
      is_verified?: boolean;
    }>).map((s) => ({
      id: s.id,
      fullName: s.business_name,
      handle: shopUsername(s.business_name, s.slug),
      avatarUrl: s.logo_url,
      bio: null,
      joinedAt: null,
      shopId: s.id,
      shopName: s.business_name,
      shopSlug: s.slug,
      verifiedBadge: Boolean(s.is_verified),
    }));
    return { people: fromShops, error: shops.error?.message ?? null };
  }

  const shopMap = await shopsByOwner(rows.map((r) => r.id));
  return { people: rows.map((row) => asPerson(row, shopMap.get(row.id))), error: null };
}

export async function fetchProfilePosts(profileId: string): Promise<PublicFeedVideo[]> {
  const supabase = getSupabaseBrowserClient();
  const shop = (await shopsByOwner([profileId])).get(profileId);
  const fromProfile = await supabase
    .from("public_video_feed")
    .select("*")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(80);
  let posts = !fromProfile.error ? ((fromProfile.data ?? []) as PublicFeedVideo[]) : [];
  if (shop) {
    const fromShop = await fetchPostsForBusiness(shop.id);
    const seen = new Set(posts.map((p) => p.id));
    posts = [...posts, ...fromShop.filter((p) => !seen.has(p.id))];
  }
  return posts;
}

export async function fetchProfileProducts(profileId: string): Promise<PublicProduct[]> {
  const shop = (await shopsByOwner([profileId])).get(profileId);
  if (!shop) return [];
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("public_business_products")
    .select(PRODUCT_SELECT)
    .eq("business_id", shop.id)
    .eq("is_available", true)
    .order("created_at", { ascending: false })
    .limit(80);
  if (!error) return (data ?? []) as PublicProduct[];
  const raw = await supabase
    .from("business_products")
    .select("id, business_id, name, description, sale_price, image_url, extra_image_urls, video_url, is_available, created_at")
    .eq("business_id", shop.id)
    .order("created_at", { ascending: false })
    .limit(80);
  return (raw.data ?? []) as PublicProduct[];
}

async function peopleFromIds(ids: string[]): Promise<PublicFollower[]> {
  if (ids.length === 0) return [];
  const supabase = getSupabaseBrowserClient();
  const map = new Map<string, ProfileRow>();
  const view = await supabase.from("public_profiles").select("id, full_name, avatar_url").in("id", ids);
  for (const p of (view.data ?? []) as ProfileRow[]) map.set(p.id, p);
  if (map.size < ids.length) {
    const fallback = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids);
    for (const p of (fallback.data ?? []) as ProfileRow[]) map.set(p.id, p);
  }
  const shops = await shopsByOwner(ids);
  return ids.map((id) => {
    const row = map.get(id);
    const shop = shops.get(id);
    const name = row?.full_name?.trim() || shop?.business_name?.trim() || "TIJAR member";
    return {
      id,
      name,
      handle: shop ? shopUsername(shop.business_name, shop.public_slug) : shopUsername(name),
      avatarUrl: shop?.logo_url ?? row?.avatar_url ?? null,
      shopSlug: shop ? shopLinkSlug(shop.public_slug, shop.id) : null,
    };
  });
}

export async function fetchProfileFollowers(profileId: string): Promise<PublicFollower[]> {
  const supabase = getSupabaseBrowserClient();
  const shop = (await shopsByOwner([profileId])).get(profileId);
  const people = await supabase.from("public_profile_follows").select("follower_id").eq("followee_id", profileId).limit(300);
  const personIds = ((people.data ?? []) as Array<{ follower_id: string }>).map((r) => r.follower_id);
  let shopIds: string[] = [];
  if (shop) {
    const shops = await supabase.from("public_shop_follows").select("profile_id").eq("business_id", shop.id).limit(300);
    if (shops.error) {
      const live = await supabase.from("business_follows").select("profile_id").eq("business_id", shop.id).limit(300);
      shopIds = ((live.data ?? []) as Array<{ profile_id: string }>).map((r) => r.profile_id);
    } else {
      shopIds = ((shops.data ?? []) as Array<{ profile_id: string }>).map((r) => r.profile_id);
    }
  }
  if (people.error) {
    const live = await supabase.from("profile_follows").select("follower_id").eq("followee_id", profileId).limit(300);
    personIds.push(...((live.data ?? []) as Array<{ follower_id: string }>).map((r) => r.follower_id));
  }
  const ids = [...new Set([...personIds, ...shopIds])].filter((id) => id && id !== profileId);
  return peopleFromIds(ids);
}

export async function isFollowingPerson(followerId: string, followeeId: string): Promise<boolean> {
  if (!followerId || !followeeId || followerId === followeeId) return false;
  const supabase = getSupabaseBrowserClient();
  const view = await supabase
    .from("public_profile_follows")
    .select("follower_id")
    .eq("follower_id", followerId)
    .eq("followee_id", followeeId)
    .maybeSingle();
  if (!view.error) return Boolean(view.data);
  const live = await supabase
    .from("profile_follows")
    .select("follower_id")
    .eq("follower_id", followerId)
    .eq("followee_id", followeeId)
    .maybeSingle();
  return Boolean(live.data);
}

export async function fetchProfileFollowing(profileId: string): Promise<PublicFollower[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.from("public_profile_follows").select("followee_id").eq("follower_id", profileId).limit(300);
  const ids = error
    ? ((await supabase.from("profile_follows").select("followee_id").eq("follower_id", profileId).limit(300)).data ?? []).map(
        (r) => r.followee_id as string,
      )
    : ((data ?? []) as Array<{ followee_id: string }>).map((r) => r.followee_id);
  return peopleFromIds([...new Set(ids)].filter(Boolean));
}
