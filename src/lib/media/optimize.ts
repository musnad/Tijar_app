/** Resize photos through Supabase image render so phones download less. */

const OBJECT_PUBLIC = "/storage/v1/object/public/";
const OBJECT_SIGN = "/storage/v1/object/sign/";
const RENDER_PUBLIC = "/storage/v1/render/image/public/";
const RENDER_SIGN = "/storage/v1/render/image/sign/";

let renderFailCount = 0;

export function markOptimizedImageFailed(): void {
  renderFailCount += 1;
}

export function resetOptimizedImageFailures(): void {
  renderFailCount = 0;
}

function renderDisabled(): boolean {
  return renderFailCount >= 2;
}

function qualityFor(width: number): string {
  if (width <= 160) return "64";
  if (width <= 540) return "68";
  return "72";
}

function toRenderPath(pathname: string): string | null {
  if (pathname.includes(RENDER_PUBLIC) || pathname.includes(RENDER_SIGN)) return pathname;
  if (pathname.includes(OBJECT_PUBLIC)) return pathname.replace(OBJECT_PUBLIC, RENDER_PUBLIC);
  if (pathname.includes(OBJECT_SIGN)) return pathname.replace(OBJECT_SIGN, RENDER_SIGN);
  return null;
}

/** Public storage URL resized for the on-screen width. Falls back to the original. */
export function optimizedImageUrl(url: string | null | undefined, width = 540): string {
  if (!url) return "";
  if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("/")) return url;
  if (renderDisabled()) return url;
  try {
    const parsed = new URL(url);
    const nextPath = toRenderPath(parsed.pathname);
    if (!nextPath) return url;
    parsed.pathname = nextPath;
    const w = Math.max(48, Math.min(1080, Math.round(width)));
    parsed.searchParams.set("width", String(w));
    parsed.searchParams.set("quality", qualityFor(w));
    parsed.searchParams.set("resize", "contain");
    return parsed.toString();
  } catch {
    return url;
  }
}

export function optimizedImageSrcSet(url: string, width = 540): string | undefined {
  if (!url || url.startsWith("data:") || url.startsWith("blob:") || renderDisabled() || width <= 200) {
    return undefined;
  }
  const widths = [...new Set([Math.round(width * 0.7), width, Math.round(width * 1.4)])]
    .map((w) => Math.max(48, Math.min(1080, w)))
    .sort((a, b) => a - b);
  if (widths.length < 2) return undefined;
  return widths.map((w) => `${optimizedImageUrl(url, w)} ${w}w`).join(", ");
}

export function imageSizesFor(width: number): string {
  if (width <= 200) return `${width}px`;
  return "(max-width: 480px) 100vw, 540px";
}

export function supabaseStorageOrigin(): string | null {
  try {
    const raw = typeof import.meta !== "undefined" ? import.meta.env?.VITE_SUPABASE_URL : undefined;
    if (typeof raw !== "string" || !raw.trim()) return null;
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

const prefetched = new Set<string>();

/** Warm the first feed photos before they scroll into view. */
export function prefetchOptimizedImages(urls: Array<string | null | undefined>, width = 540): void {
  if (typeof document === "undefined") return;
  let added = 0;
  for (const url of urls) {
    if (!url || added >= 6) continue;
    const href = optimizedImageUrl(url, width);
    if (!href || prefetched.has(href)) continue;
    prefetched.add(href);
    added += 1;
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = href;
    document.head.appendChild(link);
  }
}
