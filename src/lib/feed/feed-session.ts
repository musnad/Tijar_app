/** Session rotation so tapping Home surfaces a different mix, including older posts. */

export const HOME_REFRESH_EVENT = "tijar-home-refresh";

const SEEN_KEY = "tijar-feed-seen";
const ROUND_KEY = "tijar-feed-round";
const SALT_KEY = "tijar-feed-salt";
const MAX_SEEN = 220;

function readJsonArray(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function readSeenFeedIds(): Set<string> {
  return new Set(readJsonArray(SEEN_KEY));
}

export function rememberSeenFeedIds(ids: string[]): void {
  if (typeof window === "undefined" || ids.length === 0) return;
  const seen = readSeenFeedIds();
  for (const id of ids) seen.add(id);
  const next = [...seen];
  const trimmed = next.length > MAX_SEEN ? next.slice(next.length - MAX_SEEN) : next;
  try {
    window.sessionStorage.setItem(SEEN_KEY, JSON.stringify(trimmed));
  } catch {
    // Ignore.
  }
}

export function currentFeedRound(): number {
  if (typeof window === "undefined") return 0;
  try {
    return Number(window.sessionStorage.getItem(ROUND_KEY) || "0") || 0;
  } catch {
    return 0;
  }
}

export function bumpFeedRound(): number {
  const next = currentFeedRound() + 1;
  try {
    if (typeof window !== "undefined") window.sessionStorage.setItem(ROUND_KEY, String(next));
  } catch {
    // Ignore.
  }
  return next;
}

export function feedOffsetForRound(round: number, pageSize: number, windows = 10): number {
  return (round % windows) * pageSize;
}

export function currentFeedSalt(): string {
  if (typeof window === "undefined") return "0";
  try {
    return window.sessionStorage.getItem(SALT_KEY) || "0";
  } catch {
    return "0";
  }
}

export function rotateFeedSalt(): string {
  const salt = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    if (typeof window !== "undefined") window.sessionStorage.setItem(SALT_KEY, salt);
  } catch {
    // Ignore.
  }
  return salt;
}

export function hashFeedKey(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Higher = should appear earlier. Unseen and older-unseen rise after each Home tap. */
export function mixFeedScore(id: string, ts: number, salt: string, seen: Set<string>): number {
  const jitter = (hashFeedKey(`${salt}:${id}`) % 1000) / 1000;
  const ageHours = Math.max(0, (Date.now() - (ts || 0)) / 3_600_000);
  const recency = 1 / (1 + ageHours / 36);
  const unseen = seen.has(id) ? 0 : 1.35;
  const olderUnseen = !seen.has(id) && ageHours > 12 ? 0.9 : 0;
  return unseen + olderUnseen + recency * 0.35 + jitter * 0.55;
}
