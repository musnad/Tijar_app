/**
 * Shared hardening for TIJAR's AI routes (translate / speak / studio).
 * Goals: keep provider API keys server-only, stop cross-site abuse, bind rate
 * limits to real client IP (never trust an unverified JWT alone), reject
 * oversized / wrong-type bodies, and never echo provider internals.
 */

import { createClient } from "@supabase/supabase-js";

import { readEnvString, readSupabasePublicEnv } from "@/lib/supabase/runtime-env";

export const TRANSLATE_MAX_BODY_BYTES = 8_192; // ~8 KB JSON is plenty for ≤1000 chars
export const TRANSLATE_BATCH_MAX_BODY_BYTES = 16_384;

const SECURE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

export function jsonSecure(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return Response.json(body, {
    status: init.status ?? 200,
    headers: { ...SECURE_HEADERS, ...(init.headers ?? {}) },
  });
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = request.headers.get("x-real-ip")?.trim();
  const ip = forwarded || real || "unknown";
  // Cap length so a forged header cannot bloat rate-limit keys.
  return ip.slice(0, 64);
}

/** Origins allowed to call TIJAR AI APIs (same site + configured public URL). */
export function allowedTranslateOrigins(requestUrl: string): Set<string> {
  const allowed = new Set<string>();
  try {
    allowed.add(new URL(requestUrl).origin);
  } catch {
    /* ignore */
  }
  const publicUrl = readEnvString("VITE_PUBLIC_APP_URL");
  if (publicUrl) {
    try {
      allowed.add(new URL(publicUrl).origin);
    } catch {
      /* ignore */
    }
  }
  const extra = readEnvString("TRANSLATE_ALLOWED_ORIGINS");
  if (extra) {
    for (const part of extra.split(",")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      try {
        allowed.add(new URL(trimmed).origin);
      } catch {
        /* ignore bad entries */
      }
    }
  }
  // Local / Android WebView dev
  allowed.add("http://localhost:3000");
  allowed.add("http://127.0.0.1:3000");
  return allowed;
}

export type OriginCheck = { ok: true } | { ok: false; status: number; code: string; message: string };

/**
 * Block cross-site browser calls. Native/mobile clients without Origin are
 * still protected by IP rate limits. Forged Origin from non-browsers cannot
 * bypass those limits.
 */
export function assertTranslateOrigin(request: Request): OriginCheck {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");

  if (!origin) {
    // Same-origin navigations / some WebViews omit Origin; allow only when
    // Sec-Fetch-Site says same-origin/same-site or is absent (non-browser).
    if (!fetchSite || fetchSite === "same-origin" || fetchSite === "same-site" || fetchSite === "none") {
      return { ok: true };
    }
    return {
      ok: false,
      status: 403,
      code: "FORBIDDEN_ORIGIN",
      message: "Translation is only available from the TIJAR app.",
    };
  }

  const allowed = allowedTranslateOrigins(request.url);
  if (allowed.has(origin)) return { ok: true };

  return {
    ok: false,
    status: 403,
    code: "FORBIDDEN_ORIGIN",
    message: "Translation is only available from the TIJAR app.",
  };
}

export function assertJsonContentType(request: Request): OriginCheck {
  const ct = request.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("application/json")) {
    return {
      ok: false,
      status: 415,
      code: "UNSUPPORTED_MEDIA",
      message: "Content-Type must be application/json.",
    };
  }
  return { ok: true };
}

export async function readJsonBody(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; body: unknown } | { ok: false; status: number; code: string; message: string }> {
  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader) {
    const n = Number(lengthHeader);
    if (Number.isFinite(n) && n > maxBytes) {
      return {
        ok: false,
        status: 413,
        code: "PAYLOAD_TOO_LARGE",
        message: "Request is too large.",
      };
    }
  }

  const raw = await request.text().catch(() => null);
  if (raw === null) {
    return { ok: false, status: 400, code: "VALIDATION", message: "Invalid request body." };
  }
  if (raw.length > maxBytes) {
    return { ok: false, status: 413, code: "PAYLOAD_TOO_LARGE", message: "Request is too large." };
  }
  try {
    return { ok: true, body: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false, status: 400, code: "VALIDATION", message: "Invalid JSON body." };
  }
}

/**
 * Rate-limit key is ALWAYS bound to client IP so a forged Bearer JWT cannot
 * mint unlimited buckets. Verified user id is appended only after Supabase
 * confirms the token.
 */
export async function resolveTranslateRateKey(request: Request): Promise<{
  rateLimitKey: string;
  userId: string | null;
  authenticated: boolean;
}> {
  const ip = clientIp(request);
  const userId = await verifySupabaseUserId(request);
  if (userId) {
    return { rateLimitKey: `ip:${ip}|user:${userId}`, userId, authenticated: true };
  }
  return { rateLimitKey: `ip:${ip}`, userId: null, authenticated: false };
}

async function verifySupabaseUserId(request: Request): Promise<string | null> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token || token.length > 4096) return null;

  const env = readSupabasePublicEnv();
  if (!env) return null;

  try {
    const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user?.id) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

/** Gate for admin/system batch translation — requires a verified session. */
export async function requireAuthenticatedUser(
  request: Request,
): Promise<{ ok: true; userId: string } | { ok: false; status: number; code: string; message: string }> {
  const userId = await verifySupabaseUserId(request);
  if (!userId) {
    return {
      ok: false,
      status: 401,
      code: "UNAUTHORIZED",
      message: "Sign in to use batch translation.",
    };
  }
  return { ok: true, userId };
}
