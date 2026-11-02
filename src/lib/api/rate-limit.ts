/**
 * Simple in-memory sliding-window rate limiter (per server instance).
 * Keys are user ids or IPs — never message content.
 * For multi-instance production, back this with Redis/Upstash; the
 * interface stays the same.
 */

type Bucket = { timestamps: number[] };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

export function checkRateLimit(
  key: string,
  limit = 20,
  windowMs = 60_000,
  now = Date.now(),
): RateLimitResult {
  const bucket = buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);
  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0] ?? now;
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)) };
  }
  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function clearRateLimits(): void {
  buckets.clear();
}
