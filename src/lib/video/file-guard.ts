/** Never trust filename or declared MIME type alone. */

export const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
export const MIN_VIDEO_MS = 3_000;
export const MAX_VIDEO_MS = 10_000;
export const MIN_VIDEO_SEC = 3;
export const MAX_VIDEO_SEC = 10;
const CLIP_SLOP_MS = 250;

/** Prefer a container that keeps the microphone, not video-only VP9. */
export function pickVideoRecorderMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,vorbis",
    "video/webm",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export function videoFileFromRecording(blob: Blob, mimeType: string, prefix: string): File {
  const type = (mimeType || blob.type || "video/webm").split(";")[0] || "video/webm";
  const ext = type.includes("mp4") ? "mp4" : "webm";
  return new File([blob], `${prefix}-${Date.now()}.${ext}`, { type });
}

export function postVideoNeedsClip(durationMs: number): boolean {
  return Number.isFinite(durationMs) && durationMs > MAX_VIDEO_MS + CLIP_SLOP_MS;
}

/**
 * Keep in-app recordings and gallery uploads at 10 seconds.
 * Longer files are cut to the first 10 seconds with no seller error.
 * Photos and clips already at or under 10s are returned unchanged.
 */
async function headerBytes(file: File): Promise<Uint8Array> {
  if (file.size <= 65_536 && typeof file.arrayBuffer === "function") {
    return new Uint8Array(await file.arrayBuffer()).subarray(0, 32);
  }
  const part = file.slice(0, 32);
  if (typeof part.arrayBuffer === "function") {
    return new Uint8Array(await part.arrayBuffer());
  }
  return new Uint8Array(await new Response(part).arrayBuffer());
}

export async function clipVideoToMaxDuration(file: File, maxMs = MAX_VIDEO_MS): Promise<File> {
  if (file.size <= 0) return file;
  const header = await headerBytes(file);
  if (!sniffVideoKind(header) && !file.type.startsWith("video/")) return file;

  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("timeout")), 12_000);
      video.onloadedmetadata = () => {
        window.clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("decode"));
      };
      video.src = objectUrl;
    });

    let seconds = video.duration;
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 120) {
      try {
        await new Promise<void>((resolve) => {
          const onSeeked = () => resolve();
          video.addEventListener("seeked", onSeeked, { once: true });
          video.currentTime = 1e10;
          window.setTimeout(() => resolve(), 1_200);
        });
        seconds = video.duration;
      } catch {
        return file;
      }
    }
    if (!Number.isFinite(seconds) || seconds <= 0) return file;
    if (!postVideoNeedsClip(Math.round(seconds * 1000))) return file;
    if (typeof MediaRecorder === "undefined") return file;
    const capture =
      (
        video as HTMLVideoElement & {
          captureStream?: () => MediaStream;
          mozCaptureStream?: () => MediaStream;
        }
      ).captureStream?.bind(video) ??
      (video as HTMLVideoElement & { mozCaptureStream?: () => MediaStream }).mozCaptureStream?.bind(
        video,
      );
    if (!capture) return file;

    video.currentTime = 0;
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      window.setTimeout(() => resolve(), 400);
    });

    const stream = capture();
    const mime = pickVideoRecorderMime();
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (ev) => {
      if (ev.data.size) chunks.push(ev.data);
    };
    const done = new Promise<File>((resolve) => {
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: rec.mimeType || mime || "video/webm" });
        resolve(videoFileFromRecording(blob, rec.mimeType || blob.type, "tijar-clip"));
      };
    });
    rec.start(100);
    await video.play().catch(() => undefined);
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(() => resolve(), maxMs);
      const onTime = () => {
        if (video.currentTime * 1000 >= maxMs - 40) {
          window.clearTimeout(timer);
          video.removeEventListener("timeupdate", onTime);
          resolve();
        }
      };
      video.addEventListener("timeupdate", onTime);
    });
    video.pause();
    if (rec.state !== "inactive") rec.stop();
    stream.getTracks().forEach((track) => track.stop());
    const clipped = await done;
    return clipped.size > 0 ? clipped : file;
  } catch {
    return file;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

export type DetectedVideoKind = "mp4" | "webm";
export type DetectedImageKind = "jpeg" | "png" | "webp" | "gif";

export type ShoppingMedia =
  | {
      ok: true;
      media: "video";
      kind: DetectedVideoKind;
      durationMs: number;
      width: number;
      height: number;
    }
  | { ok: true; media: "image"; kind: DetectedImageKind; width: number; height: number }
  | { ok: false; error: string };

export function sniffImageKind(bytes: Uint8Array): DetectedImageKind | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return "png";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "gif";
  const riff = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  const four = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
  if (riff === "RIFF" && four === "WEBP") return "webp";
  return null;
}

export function sniffVideoKind(bytes: Uint8Array): DetectedVideoKind | null {
  if (bytes.length < 12) return null;
  // ISO BMFF / MP4: size + 'ftyp' at offset 4
  const box = String.fromCharCode(bytes[4]!, bytes[5]!, bytes[6]!, bytes[7]!);
  if (box === "ftyp") return "mp4";
  // WebM / Matroska EBML header 1A 45 DF A3
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3)
    return "webm";
  return null;
}

export function validateVideoFileMeta(file: File): { ok: true } | { ok: false; error: string } {
  if (file.size <= 0) return { ok: false, error: "The video file is empty." };
  if (file.size > MAX_VIDEO_BYTES) return { ok: false, error: "Video must be under 80 MB." };
  return { ok: true };
}

export async function inspectImageFile(
  file: File,
): Promise<
  | { ok: true; kind: DetectedImageKind; width: number; height: number }
  | { ok: false; error: string }
> {
  if (file.size <= 0) return { ok: false, error: "The photo is empty." };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "Photo must be under 12 MB." };
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const kind = sniffImageKind(header);
  if (!kind) return { ok: false, error: "Use a JPEG, PNG, WebP, or GIF photo." };
  const objectUrl = URL.createObjectURL(file);
  try {
    const size = await readImageElement(objectUrl);
    if (size.width < 1 || size.height < 1)
      return { ok: false, error: "Could not read this photo." };
    return { ok: true, kind, ...size };
  } catch {
    return { ok: false, error: "Could not open this photo." };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function inspectShoppingMedia(
  file: File,
  opts?: { durationHintMs?: number },
): Promise<ShoppingMedia> {
  const header = await headerBytes(file);
  if (sniffImageKind(header)) {
    const img = await inspectImageFile(file);
    if (!img.ok) return img;
    return { ok: true, media: "image", kind: img.kind, width: img.width, height: img.height };
  }
  return { ok: false, error: "Photos only. Upload JPEG, PNG, or WebP — up to 10 images." };
}

/** MediaRecorder WebM often reports Infinity; that is not a 10s clip. */
export function usableVideoDurationMs(mediaSeconds: number, hintMs?: number): number | null {
  const fromMedia =
    Number.isFinite(mediaSeconds) && mediaSeconds > 0 && mediaSeconds <= 120
      ? Math.round(mediaSeconds * 1000)
      : null;
  const fromHint =
    hintMs != null && Number.isFinite(hintMs) && hintMs > 0 && hintMs <= 120_000
      ? Math.round(hintMs)
      : null;
  return fromMedia ?? fromHint;
}

export async function inspectVideoFile(
  file: File,
  opts?: { durationHintMs?: number },
): Promise<
  | {
      ok: true;
      kind: DetectedVideoKind;
      durationMs: number;
      width: number;
      height: number;
    }
  | { ok: false; error: string }
> {
  const meta = validateVideoFileMeta(file);
  if (!meta.ok) return meta;
  const header = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const kind = sniffVideoKind(header);
  if (!kind) {
    return { ok: false, error: "File is not a real MP4 or WebM video (header check failed)." };
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const stats = await readMediaElement(objectUrl, opts?.durationHintMs);
    if (stats.durationMs == null) {
      return {
        ok: false,
        error: `Could not read video length. Record ${MIN_VIDEO_SEC}–${MAX_VIDEO_SEC} seconds.`,
      };
    }
    if (stats.durationMs < MIN_VIDEO_MS) {
      return { ok: false, error: `Video must be at least ${MIN_VIDEO_SEC} seconds.` };
    }
    if (stats.width < 1 || stats.height < 1)
      return { ok: false, error: "Could not read video dimensions." };
    if (stats.durationMs > MAX_VIDEO_MS) {
      return { ok: true, kind, durationMs: MAX_VIDEO_MS, width: stats.width, height: stats.height };
    }
    return {
      ok: true,
      kind,
      durationMs: stats.durationMs,
      width: stats.width,
      height: stats.height,
    };
  } catch {
    return { ok: false, error: "Could not decode this video in the browser." };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function readImageElement(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = window.setTimeout(() => reject(new Error("timeout")), 8_000);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("decode"));
    };
    img.src = src;
  });
}

function readMediaElement(
  src: string,
  hintMs?: number,
): Promise<{ durationMs: number | null; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const el = document.createElement("video");
    el.preload = "metadata";
    el.muted = true;
    el.playsInline = true;
    const finish = (seconds: number) => {
      resolve({
        durationMs: usableVideoDurationMs(seconds, hintMs),
        width: el.videoWidth,
        height: el.videoHeight,
      });
    };
    const timer = window.setTimeout(() => {
      el.src = "";
      const hinted = usableVideoDurationMs(Number.NaN, hintMs);
      if (hinted != null) {
        resolve({ durationMs: hinted, width: el.videoWidth, height: el.videoHeight });
        return;
      }
      reject(new Error("timeout"));
    }, 12_000);
    el.onloadedmetadata = () => {
      const raw = el.duration;
      if (Number.isFinite(raw) && raw > 0 && raw <= 120) {
        window.clearTimeout(timer);
        finish(raw);
        return;
      }
      // Chrome WebM from MediaRecorder: duration is Infinity until a far seek.
      const onSeeked = () => {
        window.clearTimeout(timer);
        finish(el.duration);
      };
      el.addEventListener("seeked", onSeeked, { once: true });
      el.addEventListener("durationchange", onSeeked, { once: true });
      try {
        el.currentTime = 1e10;
      } catch {
        window.clearTimeout(timer);
        finish(raw);
      }
    };
    el.onerror = () => {
      window.clearTimeout(timer);
      const hinted = usableVideoDurationMs(Number.NaN, hintMs);
      if (hinted != null) {
        resolve({ durationMs: hinted, width: 0, height: 0 });
        return;
      }
      reject(new Error("decode"));
    };
    el.src = src;
  });
}

export async function captureVideoThumbnail(file: File): Promise<Blob | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("thumb"));
    });
    const dur = Number.isFinite(video.duration) ? video.duration : 1;
    video.currentTime = Math.min(0.4, dur * 0.1);
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
    });
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 1280;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.82));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
