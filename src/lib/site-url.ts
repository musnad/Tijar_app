import { readEnvString } from "@/lib/supabase/runtime-env";

/** Live site used for Google callback and password-reset emails. */
export const PRODUCTION_ORIGIN = "https://www.tijar.ng";

function canonicalizeOrigin(origin: string): string {
  const trimmed = origin.replace(/\/$/, "");
  if (trimmed === "https://tijar.ng" || trimmed === "http://tijar.ng" || trimmed === "http://www.tijar.ng") {
    return PRODUCTION_ORIGIN;
  }
  return trimmed;
}

/** Public origin of this TIJAR deployment (set in hosting build env). */
export function getConfiguredSiteOrigin(): string {
  const raw = readEnvString("VITE_PUBLIC_APP_URL");
  if (raw) {
    return canonicalizeOrigin(raw);
  }
  return "";
}

function isLocalHostOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local");
  } catch {
    return /localhost|127\.0\.0\.1/.test(origin);
  }
}

/** Best origin for auth redirects and absolute links (browser or configured production URL). */
export function getSiteOrigin(): string {
  if (typeof window !== "undefined") {
    return canonicalizeOrigin(window.location.origin);
  }
  return getConfiguredSiteOrigin() || PRODUCTION_ORIGIN;
}

/** Google / email auth must never send users (or Google's consent screen) to localhost. */
export function getAuthRedirectOrigin(): string {
  const configured = getConfiguredSiteOrigin();
  if (configured && !isLocalHostOrigin(configured)) return configured;
  if (typeof window !== "undefined") {
    const live = canonicalizeOrigin(window.location.origin);
    if (!isLocalHostOrigin(live)) return live;
  }
  return PRODUCTION_ORIGIN;
}

export function absoluteAppUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const origin = getSiteOrigin();
  return origin ? `${origin}${normalized}` : normalized;
}

export function absoluteAuthUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${getAuthRedirectOrigin()}${normalized}`;
}
