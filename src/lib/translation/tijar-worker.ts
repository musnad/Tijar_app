import { createHmac } from "node:crypto";

import { sanitizeSecret } from "@/lib/secrets";
import { readEnvString } from "@/lib/supabase/runtime-env";

/** Optional self-hosted translate worker. Unset = skip (Phase 3 still uses Grok/OpenAI). */

export function tijarTranslateUrl(): string | null {
  const raw = sanitizeSecret(readEnvString("TIJAR_TRANSLATE_URL"));
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function isTijarTranslateConfigured(): boolean {
  return Boolean(tijarTranslateUrl());
}

function sign(body: string, secret: string, timestamp: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export async function tijarWorkerTranslate(
  input: { text: string; fromLanguage: string; toLanguage: string },
  deps?: { fetchImpl?: typeof fetch; url?: string; secret?: string | null; timeoutMs?: number },
): Promise<string> {
  const base = deps?.url ?? tijarTranslateUrl();
  if (!base) throw new Error("TIJAR translate worker is not configured.");
  const secret = deps?.secret !== undefined ? deps.secret : sanitizeSecret(readEnvString("TIJAR_TRANSLATE_SECRET"));
  const body = JSON.stringify({
    text: input.text.slice(0, 1000),
    fromLanguage: input.fromLanguage,
    toLanguage: input.toLanguage,
  });
  const timestamp = String(Date.now());
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Tijar-Timestamp": timestamp,
  };
  if (secret) {
    headers["X-Tijar-Signature"] = sign(body, secret, timestamp);
    headers.Authorization = `Bearer ${secret}`;
  }
  const fetchImpl = deps?.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), deps?.timeoutMs ?? 8_000);
  try {
    const res = await fetchImpl(`${base}/v1/translate`, {
      method: "POST",
      headers,
      body,
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error("TIJAR translate worker failed.");
    const json = (await res.json()) as { translatedText?: string };
    const out = json.translatedText?.trim();
    if (!out) throw new Error("TIJAR translate worker returned empty text.");
    return out.replace(/^["']|["']$/g, "").trim();
  } finally {
    clearTimeout(timer);
  }
}
