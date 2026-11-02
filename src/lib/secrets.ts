/**
 * Shared secret hygiene for server-only API keys.
 * TIJAR reads keys from the server process env at request time (never
 * `VITE_`-prefixed, never inlined at build time).
 */

/** Strip accidental quotes/whitespace/zero-width chars from dashboard-pasted secrets. */
export function sanitizeSecret(value: string | undefined | null): string | null {
  if (!value) return null;
  let v = value.trim().replace(/[\u200B-\u200D\uFEFF\u202A-\u202E]/g, "");
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  v = v.replace(/\s+/g, "");
  // Common paste mistake: "Bearer sk-…" stored as the whole env value
  if (/^bearer/i.test(v)) {
    v = v.replace(/^bearer/i, "").trim();
  }
  return v.length > 0 ? v : null;
}
