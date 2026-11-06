import type { VideoAttribution } from "@/lib/feed/rank-video-feed";
import { assertProductsBelongToBusiness, requireShoppingTags } from "@/lib/feed/video-tag-guard";
import { captureVideoThumbnail, inspectShoppingMedia } from "@/lib/video/file-guard";
import { videoPublicStatus } from "@/lib/video/publish-status";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { updateProductImages } from "@/services/product-service";

export { videoPublicStatus };

export type StudioSubmitInput = {
  businessId: string;
  profileId: string;
  file: File;
  caption: string;
  productIds: string[];
  products: { id: string; business_id: string }[];
  attribution: VideoAttribution;
  thumbnail?: File | null;
  rightsAttested?: boolean;
  asDraft?: boolean;
  durationHintMs?: number;
  onProgress?: (pct: number, label: string) => void;
};

const IMAGE_EXT: Record<string, { ext: string; type: string }> = {
  jpeg: { ext: "jpg", type: "image/jpeg" },
  png: { ext: "png", type: "image/png" },
  webp: { ext: "webp", type: "image/webp" },
  gif: { ext: "gif", type: "image/gif" },
};

export async function submitStudioVideo(input: StudioSubmitInput): Promise<{ error: string | null; videoId?: string }> {
  const report = (pct: number, label: string) => input.onProgress?.(pct, label);
  report(8, "Checking product and media…");

  const tags = requireShoppingTags(input.productIds);
  if (!tags.ok) return { error: tags.error };
  const owned = input.products.filter((p) => input.productIds.includes(p.id));
  if (input.productIds.length > 0) {
    const guard = assertProductsBelongToBusiness(input.businessId, owned);
    if (!guard.ok) return { error: guard.error };
  }

  const inspected = await inspectShoppingMedia(input.file, { durationHintMs: input.durationHintMs });
  if (!inspected.ok) return { error: inspected.error };

  const supabase = getSupabaseBrowserClient();
  const id = crypto.randomUUID();
  const isImage = inspected.media === "image";
  const fileMeta = isImage
    ? IMAGE_EXT[inspected.kind]!
    : { ext: inspected.kind === "webm" ? "webm" : "mp4", type: inspected.kind === "webm" ? "video/webm" : "video/mp4" };
  const storagePath = `${input.businessId}/${id}.${fileMeta.ext}`;
  report(28, "Uploading to TIJAR…");
  const { error: upErr } = await supabase.storage.from("business-videos").upload(storagePath, input.file, {
    contentType: fileMeta.type,
    upsert: false,
  });
  if (upErr) return { error: upErr.message };
  report(62, "Saving your post…");

  let coverPath: string | null = isImage ? storagePath : null;
  if (!isImage) {
    const thumb = input.thumbnail ?? (await blobToFile(await captureVideoThumbnail(input.file), `${id}.jpg`));
    if (thumb) {
      const thumbPath = `${input.businessId}/${id}.jpg`;
      const t = await supabase.storage.from("business-videos").upload(thumbPath, thumb, {
        contentType: "image/jpeg",
        upsert: true,
      });
      if (!t.error) coverPath = thumbPath;
    }
  }

  const playbackUrl = supabase.storage.from("business-videos").getPublicUrl(storagePath).data.publicUrl;
  const imageUrls: string[] = isImage ? [playbackUrl] : [];
  if (isImage && input.extraImages?.length) {
    report(48, "Uploading more photos…");
    for (const extra of input.extraImages.slice(0, MAX_POST_IMAGES - 1)) {
      const extraInspect = await inspectShoppingMedia(extra);
      if (!extraInspect.ok || extraInspect.media !== "image") continue;
      const extraMeta = IMAGE_EXT[extraInspect.kind];
      if (!extraMeta) continue;
      const extraPath = `${input.businessId}/${id}-${imageUrls.length}.${extraMeta.ext}`;
      const extraUp = await supabase.storage.from("business-videos").upload(extraPath, extra, {
        contentType: extraMeta.type,
        upsert: false,
      });
      if (extraUp.error) continue;
      imageUrls.push(supabase.storage.from("business-videos").getPublicUrl(extraPath).data.publicUrl);
    }
  }
  const goLive = !input.asDraft;
  let status: string = input.asDraft ? "draft" : "ready";
  const row = {
    id,
    business_id: input.businessId,
    profile_id: input.profileId,
    caption: input.caption.trim() || null,
    storage_path: storagePath,
    playback_url: playbackUrl,
    cover_path: coverPath,
    duration_ms: inspected.media === "image" ? null : inspected.durationMs,
    width: inspected.width,
    height: inspected.height,
    status,
    moderation_status: "pending",
    attribution: input.attribution ?? "business",
    media_kind: isImage ? "image" : "video",
    image_urls: imageUrls,
    rights_attested_at: new Date().toISOString(),
    published_at: goLive ? new Date().toISOString() : null,
  };
  let { error: rowErr } = await supabase.from("video_posts").insert(row);
  if (rowErr && /image_urls/i.test(rowErr.message)) {
    const { image_urls: _urls, ...withoutUrls } = row;
    rowErr = (await supabase.from("video_posts").insert(withoutUrls)).error;
  }
  if (rowErr && /media_kind/i.test(rowErr.message)) {
    const { media_kind: _mk, image_urls: _urls, ...withoutKind } = row;
    rowErr = (await supabase.from("video_posts").insert(withoutKind)).error;
  }
  if (rowErr && /rights_attested/i.test(rowErr.message)) {
    const { media_kind: _mk, rights_attested_at: _ra, image_urls: _urls, ...withoutRights } = row;
    rowErr = (await supabase.from("video_posts").insert(withoutRights)).error;
  }
  if (rowErr && /invalid input value for enum video_post_status/i.test(rowErr.message)) {
    status = input.asDraft ? "uploading" : "ready";
    const { media_kind: _mk, rights_attested_at: _ra, image_urls: _urls, ...base } = row;
    rowErr = (await supabase.from("video_posts").insert({ ...base, status })).error;
  }
  if (rowErr) return { error: rowErr.message };

  if (input.productIds.length > 0) {
    const rows = input.productIds.map((productId, sort_order) => ({
      video_post_id: id,
      product_id: productId,
      sort_order,
    }));
    report(82, "Linking product to the marketplace…");
    const { error: tagErr } = await supabase.from("video_post_products").insert(rows);
    if (tagErr) return { error: tagErr.message };
  }

  if (goLive && input.productIds.length > 0) {
    await supabase
      .from("products")
      .update({ is_published: true, is_active: true })
      .in("id", input.productIds)
      .eq("business_id", input.businessId);
    if (isImage && imageUrls.length > 0) {
      await updateProductImages(input.productIds[0]!, imageUrls);
    }
  }
  if (!isImage && !goLive) {
    await supabase.from("video_processing_jobs").insert({
      video_post_id: id,
      business_id: input.businessId,
      kind: "prepare",
      status: "queued",
      attempts: 0,
    });
  }
  return { error: null, videoId: id };
}

export async function finishPrepareJob(videoId: string, _businessId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const rpc = await supabase.rpc("finish_video_prepare_job", { p_video_id: videoId });
  if (!rpc.error) return { error: null };

  // Fallback if migration 000021 is not applied yet — still never stamp published_at.
  if (!/does not exist|schema cache|function/i.test(rpc.error.message)) {
    return { error: rpc.error.message };
  }

  const { error } = await supabase
    .from("video_posts")
    .update({
      status: "ready",
      processing_error: null,
    })
    .eq("id", videoId)
    .eq("business_id", _businessId);

  if (error) {
    await supabase.from("video_posts").update({ status: "failed", processing_error: error.message }).eq("id", videoId);
    return { error: error.message };
  }
  return { error: null };
}

export async function retryVideoJob(videoId: string, businessId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  await supabase.from("video_processing_jobs").insert({
    video_post_id: videoId,
    business_id: businessId,
    kind: "prepare",
    status: "queued",
    attempts: 0,
  });
  return finishPrepareJob(videoId, businessId);
}

function blobToFile(blob: Blob | null, name: string): File | null {
  if (!blob) return null;
  return new File([blob], name, { type: blob.type || "image/jpeg" });
}
