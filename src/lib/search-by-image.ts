import { aiFetch } from "@/lib/ai/client-fetch";

function fileHint(file: File): string {
  return file.name
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function compressImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const max = 512;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read that photo.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.7);
}

/** Turn a product photo into a name search query. */
export async function searchQueryFromProductImage(file: File): Promise<{ query: string; error: string | null }> {
  const hint = fileHint(file);
  try {
    const image = await compressImage(file);
    const res = await aiFetch("/api/search-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image }),
    });
    const body = (await res.json().catch(() => ({}))) as { query?: string; error?: { message?: string; code?: string } };
    const query = body.query?.trim();
    if (query) return { query, error: null };
    if (res.status === 401 || res.status === 402 || res.status === 503) {
      return { query: "", error: body.error?.message ?? "Sign in to search by photo." };
    }
    if (hint.length >= 3) return { query: hint, error: null };
    return { query: "", error: body.error?.message ?? "Could not tell what is in the photo. Try the product name." };
  } catch {
    if (hint.length >= 3) return { query: hint, error: null };
    return { query: "", error: "Could not read that photo. Try the product name." };
  }
}
