/** Shrink photos on-device before upload so Nigerian 3G/4G does less work. */

import { sniffImageKind, sniffVideoKind } from "@/lib/video/file-guard";

const MAX_EDGE = 1280;
const QUALITY = 0.72;
const SKIP_UNDER_BYTES = 180_000;

export type PreparedImage = {
  ok: true;
  file: File;
  originalBytes: number;
  outputBytes: number;
  compressed: boolean;
};

export type PrepareImageFailure = {
  ok: false;
  error: string;
};

export type PrepareImageResult = PreparedImage | PrepareImageFailure;

function looksLikeVideoName(name: string): boolean {
  return /\.(mp4|webm|mov|m4v|avi)$/i.test(name);
}

async function headerBytes(file: File): Promise<Uint8Array> {
  if (file.size <= 65_536 && typeof file.arrayBuffer === "function") {
    return new Uint8Array(await file.arrayBuffer()).subarray(0, 32);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer).subarray(0, 32));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read this file."));
    reader.readAsArrayBuffer(file.slice(0, 32));
  });
}

/** Never treat a video clip as a photo, even if the picker labelled it image/*. */
export async function isVideoFile(file: File): Promise<boolean> {
  if (file.type.startsWith("video/")) return true;
  if (looksLikeVideoName(file.name) && !file.type.startsWith("image/")) return true;
  const header = await headerBytes(file);
  return sniffVideoKind(header) != null && sniffImageKind(header) == null;
}

/**
 * Downscale and convert to WebP when it saves bytes.
 * Preserves aspect ratio. GIFs and tiny files pass through.
 * Video files are returned unchanged (callers must not upload them as images).
 * On failure, returns the original file so existing product/avatar/logo uploads keep working.
 */
export async function compressImageFile(file: File, maxEdge = MAX_EDGE): Promise<File> {
  if (await isVideoFile(file)) return file;
  if (!file.type.startsWith("image/") && sniffImageKind(await headerBytes(file)) == null)
    return file;
  if (file.type === "image/gif") return file;
  if (file.size <= SKIP_UNDER_BYTES) return file;
  if (typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1 && file.size <= 400_000) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".webp";
    return new File([blob], name, { type: "image/webp", lastModified: Date.now() });
  } catch {
    return file;
  }
}

/** Validate + compress a photo for Storage. Does not upload. Does not create leftover disk files. */
export async function prepareImageForUpload(
  file: File,
  opts?: { maxBytes?: number; maxEdge?: number },
): Promise<PrepareImageResult> {
  const maxBytes = opts?.maxBytes ?? 12 * 1024 * 1024;
  const originalBytes = file.size;

  if (originalBytes <= 0) {
    return { ok: false, error: "The photo is empty." };
  }
  if (originalBytes > maxBytes) {
    const mb = Math.max(1, Math.round(maxBytes / (1024 * 1024)));
    return { ok: false, error: `Photo is too large. Use an image under ${mb} MB.` };
  }
  if (await isVideoFile(file)) {
    return { ok: false, error: "Use a photo, not a video." };
  }

  const header = await headerBytes(file);
  const sniffed = sniffImageKind(header);
  if (!sniffed) {
    return {
      ok: false,
      error: "Use a JPG, PNG, WEBP, or GIF photo. Replace the file or pick it again.",
    };
  }

  try {
    const packed = await compressImageFile(file, opts?.maxEdge ?? MAX_EDGE);
    if (packed.size > maxBytes) {
      return {
        ok: false,
        error: "Photo is still too large after compression. Try a smaller photo.",
      };
    }
    return {
      ok: true,
      file: packed,
      originalBytes,
      outputBytes: packed.size,
      compressed: packed.size < originalBytes,
    };
  } catch {
    if (originalBytes <= maxBytes) {
      return { ok: true, file, originalBytes, outputBytes: originalBytes, compressed: false };
    }
    return { ok: false, error: "Could not process this photo. Try another JPG or PNG." };
  }
}

/** Seller-facing copy when a gallery photo fails. Never includes stack traces or Storage errors. */
export function extraPhotoError(detail: string): string {
  if (/too large/i.test(detail)) {
    return "One extra photo is too large. Use a smaller JPG, PNG, WEBP, or GIF, then try again.";
  }
  if (/empty/i.test(detail)) {
    return "One extra photo is empty. Remove it or pick the photos again.";
  }
  if (/video/i.test(detail)) {
    return "One extra photo is a video. Replace it with a JPG, PNG, WEBP, or GIF.";
  }
  return "One extra photo could not be processed. Replace it or pick the photos again.";
}

/**
 * Compress the main photo and every extra photo in memory.
 * Fails the whole batch if any extra photo is invalid. Does not upload.
 */
export async function preparePostImages(
  primary: File,
  extras: File[],
  opts?: { maxBytes?: number; maxEdge?: number },
): Promise<{ ok: true; primary: PreparedImage; extras: PreparedImage[] } | PrepareImageFailure> {
  const packed = await prepareImageForUpload(primary, opts);
  if (!packed.ok) return packed;
  const extraItems: PreparedImage[] = [];
  for (const extra of extras) {
    const result = await prepareImageForUpload(extra, opts);
    if (!result.ok) return { ok: false, error: extraPhotoError(result.error) };
    extraItems.push(result);
  }
  return { ok: true, primary: packed, extras: extraItems };
}
