import { createHash } from "node:crypto";

/** In-memory translation cache (per server instance). No user text is logged. */

type Entry = { value: string; expiresAt: number };

const MAX_ENTRIES = 500;
const DEFAULT_TTL_MS = 1000 * 60 * 60; // 1 hour

const store = new Map<string, Entry>();

export function translationCacheKey(text: string, from: string, to: string): string {
  return createHash("sha256").update(`${from}\u0000${to}\u0000${text}`).digest("hex");
}

export function getCachedTranslation(key: string, now = Date.now()): string | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt < now) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

export function setCachedTranslation(
  key: string,
  value: string,
  ttlMs = DEFAULT_TTL_MS,
  now = Date.now(),
): void {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  store.set(key, { value, expiresAt: now + ttlMs });
}

export function clearTranslationCache(): void {
  store.clear();
}

export function translationCacheSize(): number {
  return store.size;
}
