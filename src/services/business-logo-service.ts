import { compressImageFile } from "@/lib/media/compress-upload";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const BUCKET = "business-logos";

export async function uploadBusinessLogo(
  businessId: string,
  file: File,
): Promise<{ publicUrl: string | null; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  file = await compressImageFile(file, 640);
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${businessId}/logo.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type,
  });

  if (error) {
    if (error.message.includes("Bucket not found")) {
      return { publicUrl: null, error: "Logo storage is not set up on Supabase yet." };
    }
    return { publicUrl: null, error: error.message };
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { publicUrl: data.publicUrl, error: null };
}
