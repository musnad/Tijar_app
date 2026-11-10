import type { SupabaseClient } from "@supabase/supabase-js";

export type AgentOffer = {
  kind: "goods" | "service";
  name: string;
  price: number;
};

export function parseAgentOffers(raw: string): AgentOffer[] {
  try {
    const parsed = JSON.parse(raw) as Array<{ kind?: string; name?: string; price?: number | string }>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => ({
        kind: row.kind === "service" ? ("service" as const) : ("goods" as const),
        name: String(row.name ?? "").trim(),
        price: Number(row.price),
      }))
      .filter((row) => row.name.length >= 2 && Number.isFinite(row.price) && row.price > 0)
      .slice(0, 8);
  } catch {
    return [];
  }
}

export async function publishShopImagePost(
  admin: SupabaseClient,
  input: {
    businessId: string;
    profileId: string;
    caption: string;
    imageUrl: string;
    extraUrls?: string[];
    productId?: string | null;
    price?: number | null;
  },
): Promise<string | null> {
  const id = crypto.randomUUID();
  const urls = [input.imageUrl, ...(input.extraUrls ?? [])].filter(Boolean).slice(0, 6);
  if (urls.length === 0) return null;
  const row: Record<string, unknown> = {
    id,
    business_id: input.businessId,
    profile_id: input.profileId,
    caption: input.caption.slice(0, 500),
    storage_path: `agent/${input.businessId}/${id}.jpg`,
    playback_url: urls[0],
    cover_path: urls[0],
    status: "ready",
    moderation_status: "approved",
    attribution: "business",
    media_kind: "image",
    image_urls: urls,
    published_at: new Date().toISOString(),
    price: input.price ?? null,
  };
  let { error } = await admin.from("video_posts").insert(row);
  if (error && /price|image_urls|media_kind/i.test(error.message)) {
    const slim = { ...row };
    if (/price/i.test(error.message)) delete slim.price;
    if (/image_urls/i.test(error.message)) delete slim.image_urls;
    if (/media_kind/i.test(error.message)) delete slim.media_kind;
    error = (await admin.from("video_posts").insert(slim)).error;
  }
  if (error) return null;
  if (input.productId) {
    await admin.from("video_post_products").insert({
      video_post_id: id,
      product_id: input.productId,
      sort_order: 0,
    });
  }
  return id;
}

export async function createAgentCatalogue(
  admin: SupabaseClient,
  input: {
    businessId: string;
    ownerProfileId: string;
    businessName: string;
    location: string;
    gallery: string[];
    offers: AgentOffer[];
  },
): Promise<void> {
  const productIds: string[] = [];
  const gallery = input.gallery.filter(Boolean);
  for (const offer of input.offers) {
    const payload = {
      business_id: input.businessId,
      name: offer.name,
      kind: offer.kind,
      unit: offer.kind === "service" ? "job" : "piece",
      sale_price: offer.price,
      stock_quantity: offer.kind === "service" ? 0 : 1,
      low_stock_threshold: offer.kind === "service" ? 0 : 5,
      notes: `${offer.name} in ${input.location}`,
      description: `${offer.name} · ${input.location}`,
      image_url: gallery[0] ?? null,
      extra_image_urls: gallery.slice(1),
      is_published: true,
      is_active: true,
      currency: "NGN",
    };
    let inserted = await admin.from("products").insert(payload).select("id").maybeSingle();
    if (inserted.error && /extra_image_urls|kind/i.test(inserted.error.message)) {
      const { extra_image_urls: _e, kind: _k, ...slim } = payload;
      inserted = await admin.from("products").insert(slim).select("id").maybeSingle();
    }
    if (inserted.data?.id) {
      productIds.push(String(inserted.data.id));
      await publishShopImagePost(admin, {
        businessId: input.businessId,
        profileId: input.ownerProfileId,
        caption: `${input.businessName} · ${offer.name} · ₦${Math.round(offer.price).toLocaleString("en-NG")} · ${input.location}`,
        imageUrl: gallery[0] ?? "",
        extraUrls: gallery.slice(1),
        productId: String(inserted.data.id),
        price: offer.price,
      });
    }
  }
  if (productIds.length === 0 && gallery[0]) {
    await publishShopImagePost(admin, {
      businessId: input.businessId,
      profileId: input.ownerProfileId,
      caption: `${input.businessName} · ${input.location}`,
      imageUrl: gallery[0],
      extraUrls: gallery.slice(1),
    });
  }
  if (gallery.length > 1) {
    await admin.from("agent_gallery_rotation").upsert({
      business_id: input.businessId,
      image_urls: gallery,
      next_index: 1,
      last_posted_at: new Date().toISOString(),
    });
  }
  await admin.rpc("ensure_marketplace_listing", { p_business_id: input.businessId });
}

export async function applyAgentShopEdit(
  admin: SupabaseClient,
  shopId: string,
  payload: { businessName: string; phone: string; location: string; password: string; category: string },
) {
  await admin
    .from("businesses")
    .update({
      business_name: payload.businessName,
      public_phone: payload.phone || null,
      public_whatsapp: payload.phone || null,
      public_location_label: payload.location || null,
      location: payload.location || null,
      custom_category: payload.category || null,
    })
    .eq("id", shopId);
  if (payload.password.length >= 8) {
    const secret = await admin
      .from("agent_shop_secrets")
      .select("agent_profile_id, login_email")
      .eq("business_id", shopId)
      .maybeSingle();
    const shop = await admin.from("businesses").select("owner_id").eq("id", shopId).maybeSingle();
    const profile = shop.data?.owner_id
      ? await admin.from("profiles").select("auth_id").eq("id", shop.data.owner_id).maybeSingle()
      : { data: null };
    if (profile.data?.auth_id) {
      await admin.auth.admin.updateUserById(String(profile.data.auth_id), { password: payload.password });
    }
    await admin.from("agent_shop_secrets").upsert({
      business_id: shopId,
      agent_profile_id: secret.data?.agent_profile_id ?? shop.data?.owner_id,
      login_email: secret.data?.login_email,
      login_password: payload.password,
      updated_at: new Date().toISOString(),
    });
  }
}

export async function rotateDueGalleryPosts(admin: SupabaseClient): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: queues } = await admin
    .from("agent_gallery_rotation")
    .select("business_id, image_urls, next_index, last_posted_at")
    .lte("last_posted_at", cutoff)
    .limit(80);
  let posted = 0;
  for (const row of queues ?? []) {
    const urls = (row.image_urls as string[] | null)?.filter(Boolean) ?? [];
    if (urls.length < 2) continue;
    const shop = await admin
      .from("businesses")
      .select("id, owner_id, business_name, public_location_label, deleted_at, is_published")
      .eq("id", row.business_id)
      .maybeSingle();
    if (!shop.data?.id || shop.data.deleted_at || shop.data.is_published === false) continue;
    const index = Math.abs(Number(row.next_index) || 0) % urls.length;
    const imageUrl = urls[index]!;
    const caption = `${String(shop.data.business_name)} · ${String(shop.data.public_location_label ?? "")}`.trim();
    const product = await admin
      .from("products")
      .select("id, sale_price, name")
      .eq("business_id", shop.data.id)
      .eq("is_published", true)
      .limit(1)
      .maybeSingle();
    const ok = await publishShopImagePost(admin, {
      businessId: String(shop.data.id),
      profileId: String(shop.data.owner_id),
      caption: product.data?.name ? `${caption} · ${product.data.name}` : caption,
      imageUrl,
      productId: product.data?.id ? String(product.data.id) : null,
      price: product.data?.sale_price != null ? Number(product.data.sale_price) : null,
    });
    if (!ok) continue;
    posted += 1;
    await admin
      .from("agent_gallery_rotation")
      .update({
        next_index: (index + 1) % urls.length,
        last_posted_at: new Date().toISOString(),
      })
      .eq("business_id", row.business_id);
  }
  return posted;
}
