/** New posts surface at the top on their own. A Home refresh mixes older posts up, unless something new just arrived. */

export const HOME_REFRESH_EVENT = "tijar-home-refresh";

const SEEN_KEY = "tijar-feed-seen";
const ROUND_KEY = "tijar-feed-round";
const SALT_KEY = "tijar-feed-salt";
const PENDING_KEY = "tijar-feed-refresh-pending";
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

/** Kept for listings rotation. For You video pages always start at offset 0 so new posts stay on top. */
export function feedOffsetForRound(round: number, pageSize: number, windows = 10): number {
  return (round % windows) * pageSize;
}

export function markHomeRefreshPending(): void {
  try {
    if (typeof window !== "undefined") window.sessionStorage.setItem(PENDING_KEY, "1");
  } catch {
    // Ignore.
  }
}

export function consumeHomeRefreshPending(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const pending = window.sessionStorage.getItem(PENDING_KEY) === "1";
    if (pending) window.sessionStorage.removeItem(PENDING_KEY);
    return pending;
  } catch {
    return false;
  }
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

export const FRESH_POST_HOURS = 12;

export function mixFeedScore(id: string, ts: number, salt: string, seen: Set<string>): number {
  const ageHours = Math.max(0, (Date.now() - (ts || 0)) / 3_600_000);
  if (ageHours <= FRESH_POST_HOURS) {
    return 10_000 - ageHours;
  }
  const jitter = (hashFeedKey(`${salt}:${id}`) % 1000) / 1000;
  const recency = 1 / (1 + ageHours / 36);
  const unseen = seen.has(id) ? 0 : 1.35;
  const olderUnseen = !seen.has(id) ? 0.9 : 0;
  return unseen + olderUnseen + recency * 0.35 + jitter * 0.55;
}

/** Shuffle older posts on refresh. Does not pin brand-new items (those go first separately). */
export function mixOlderScore(id: string, ts: number, salt: string, seen: Set<string>): number {
  const ageHours = Math.max(0, (Date.now() - (ts || 0)) / 3_600_000);
  const jitter = (hashFeedKey(`mix:${salt}:${id}`) % 1000) / 1000;
  const unseen = seen.has(id) ? 0 : 2.4;
  const recency = 1 / (1 + ageHours / 48);
  return unseen + jitter * 1.6 + recency * 0.15;
}

export function orderHomeFeed<T extends { key: string; ts: number }>(
  items: T[],
  opts: {
    salt: string;
    seen: Set<string>;
    knownKeys: Set<string>;
    mixRefresh: boolean;
    lockedKeys?: string[];
  },
): T[] {
  if (items.length <= 1) return items;
  const known = opts.knownKeys;
  const byKey = new Map(items.map((item) => [item.key, item]));
  const fresh = items
    .filter((item) => !known.has(item.key))
    .sort((a, b) => b.ts - a.ts || a.key.localeCompare(b.key));

  if (known.size === 0 && !opts.mixRefresh) {
    return [...items].sort((a, b) => b.ts - a.ts || a.key.localeCompare(b.key));
  }

  if (opts.mixRefresh) {
    const rest = items
      .filter((item) => known.has(item.key))
      .sort(
        (a, b) =>
          mixOlderScore(b.key, b.ts, opts.salt, opts.seen) - mixOlderScore(a.key, a.ts, opts.salt, opts.seen) ||
          b.ts - a.ts,
      );
    return [...fresh, ...rest];
  }

  const locked = opts.lockedKeys ?? [];
  const used = new Set(fresh.map((item) => item.key));
  const rest: T[] = [];
  for (const key of locked) {
    const item = byKey.get(key);
    if (!item || used.has(key)) continue;
    used.add(key);
    rest.push(item);
  }
  for (const item of items) {
    if (used.has(item.key)) continue;
    rest.push(item);
  }
  return [...fresh, ...rest];
}
