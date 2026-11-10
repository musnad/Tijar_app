import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdObjective, AdSourceKind } from "@/lib/ads/packages";

export type SponsoredAdRow = {
  id: string;
  business_id: string;
  profile_id: string;
  source_kind: AdSourceKind;
  video_post_id: string | null;
  product_id: string | null;
  flyer_url: string | null;
  caption: string | null;
  destination_url: string | null;
  objective: AdObjective;
  duration_hours: number;
  amount_ngn: number;
  status: string;
  created_post: boolean;
};

export async function expireDueAds(admin: SupabaseClient): Promise<number> {
  const due = await admin
    .from("sponsored_ads")
    .select("id, video_post_id, created_post")
    .eq("status", "live")
    .lte("ends_at", new Date().toISOString());
  const rows = due.data ?? [];
  if (rows.length === 0) {
    await admin.rpc("expire_sponsored_ads");
    return 0;
  }
  const ids = rows.map((row) => String(row.id));
  await admin.from("sponsored_ads").update({ status: "ended", updated_at: new Date().toISOString() }).in("id", ids);
  for (const row of rows) {
    const postId = row.video_post_id as string | null;
    if (!postId) continue;
    if (row.created_post) {
      await admin.from("video_posts").update({ status: "processing", published_at: null }).eq("id", postId);
    } else {
      await admin.from("video_posts").update({ attribution: "business" }).eq("id", postId);
    }
  }
  return ids.length;
}

export async function activateSponsoredAd(
  admin: SupabaseClient,
  ad: SponsoredAdRow,
  paymentReference?: string | null,
): Promise<{ error: string | null }> {
  const starts = new Date();
  const ends = new Date(starts.getTime() + Number(ad.duration_hours) * 60 * 60 * 1000);
  let postId = ad.video_post_id;
  let createdPost = ad.created_post;

  if (ad.source_kind === "post" && postId) {
    await admin
      .from("video_posts")
      .update({
        attribution: "sponsored",
        published_at: starts.toISOString(),
      })
      .eq("id", postId);
  } else if (!postId) {
    const media =
      ad.flyer_url ||
      (ad.product_id
        ? ((
            await admin.from("products").select("image_url, name").eq("id", ad.product_id).maybeSingle()
          ).data?.image_url as string | null)
        : null);
    if (!media) return { error: "Add a flyer or pick a post/product with a photo." };
    const id = crypto.randomUUID();
    const caption = ad.caption?.trim() || "Paid ads on TIJAR";
    const row: Record<string, unknown> = {
      id,
      business_id: ad.business_id,
      profile_id: ad.profile_id,
      caption: caption.slice(0, 500),
      storage_path: media,
      playback_url: media,
      cover_path: media,
      status: "ready",
      moderation_status: "approved",
      attribution: "sponsored",
      media_kind: "image",
      image_urls: [media],
      published_at: starts.toISOString(),
    };
    let { error } = await admin.from("video_posts").insert(row);
    if (error && /attribution|image_urls|media_kind|price/i.test(error.message)) {
      const slim = { ...row };
      if (/image_urls/i.test(error.message)) delete slim.image_urls;
      if (/media_kind/i.test(error.message)) delete slim.media_kind;
      error = (await admin.from("video_posts").insert(slim)).error;
    }
    if (error) return { error: error.message };
    postId = id;
    createdPost = true;
    if (ad.product_id) {
      await admin.from("video_post_products").insert({
        video_post_id: id,
        product_id: ad.product_id,
        sort_order: 0,
      });
    }
  }

  const { error } = await admin
    .from("sponsored_ads")
    .update({
      status: "live",
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      paid_at: new Date().toISOString(),
      payment_reference: paymentReference ?? null,
      video_post_id: postId,
      created_post: createdPost,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ad.id);
  return { error: error?.message ?? null };
}
