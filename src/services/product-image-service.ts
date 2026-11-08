import { compressImageFile } from "@/lib/media/compress-upload";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const BUCKET = "product-images";
const MAX_BYTES = 5 * 1024 * 1024;

function mapUploadError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("bucket not found")) {
    return "Image storage is not set up on Supabase yet.";
  }
  if (m.includes("row-level security") || m.includes("rls") || m.includes("policy")) {
    return "Could not upload photo — sign in again, then retry.";
  }
  if (m.includes("payload too large") || m.includes("maximum allowed size")) {
    return "Photo is too large. Use an image under 5 MB.";
  }
  if (m.includes("mime") || m.includes("type")) {
    return "Use a JPG, PNG, WEBP, or GIF photo.";
  }
  return message;
}

export async function uploadProductImage(
  businessId: string,
  productId: string,
  file: File,
  slot = 0,
): Promise<{ publicUrl: string | null; error: string | null }> {
  if (!file.type.startsWith("image/")) {
    return { publicUrl: null, error: "Use a JPG, PNG, WEBP, or GIF photo." };
  }
  if (file.size > MAX_BYTES) {
    return { publicUrl: null, error: "Photo is too large. Use an image under 5 MB." };
  }

  const supabase = getSupabaseBrowserClient();
  const packed = await compressImageFile(file);
  file = packed;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return { publicUrl: null, error: "Your session expired. Sign in again, then add the product." };
  }

  const extRaw = file.name.split(".").pop()?.toLowerCase() || "";
  const ext =
    extRaw === "jpeg" || extRaw === "jpg" || extRaw === "png" || extRaw === "webp" || extRaw === "gif"
      ? extRaw === "jpeg"
        ? "jpg"
        : extRaw
      : file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : file.type === "image/gif"
            ? "gif"
            : "jpg";

  const path = `${businessId}/${productId}/${slot}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || `image/${ext === "jpg" ? "jpeg" : ext}`,
  });

  if (error) {
    return { publicUrl: null, error: mapUploadError(error.message) };
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { publicUrl: data.publicUrl, error: null };
}
