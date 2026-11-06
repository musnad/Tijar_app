import { z } from "zod";

export const supabasePublicEnvSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
  VITE_APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
});

export type SupabasePublicEnv = z.infer<typeof supabasePublicEnvSchema>;

const URL_KEYS = ["VITE_SUPABASE_URL", "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"] as const;
const KEY_KEYS = [
  "VITE_SUPABASE_ANON_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

/** Vite embed at build time, or host `process.env` at runtime (e.g. Vercel serverless). */
export function readEnvString(key: string): string | undefined {
  if (key === "VITE_SUPABASE_URL" || key === "VITE_SUPABASE_ANON_KEY" || key === "VITE_APP_ENV" || key === "VITE_PUBLIC_APP_URL") {
    const fromMeta = import.meta.env[key];
    if (typeof fromMeta === "string" && fromMeta.trim()) return fromMeta.trim();
  }
  const env = typeof process === "undefined" ? undefined : process.env;
  const fromProcess = env?.[key];
  if (typeof fromProcess === "string" && fromProcess.trim()) return fromProcess.trim();
  return undefined;
}

function readFirstEnv(keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = readEnvString(key);
    if (value) return value;
  }
  return undefined;
}

/** Safe booleans for /api/supabase-health (no secret values). */
export function supabaseEnvDiagnostics(): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const key of [...URL_KEYS, ...KEY_KEYS, "VITE_PUBLIC_APP_URL", "VITE_APP_ENV"]) {
    flags[key] = Boolean(readEnvString(key));
  }
  return flags;
}

export function readSupabasePublicEnv(): SupabasePublicEnv | null {
  const parsed = supabasePublicEnvSchema.safeParse({
    VITE_SUPABASE_URL: readFirstEnv(URL_KEYS),
    VITE_SUPABASE_ANON_KEY: readFirstEnv(KEY_KEYS),
    VITE_APP_ENV: readEnvString("VITE_APP_ENV") ?? "development",
  });
  return parsed.success ? parsed.data : null;
}

export function isSupabaseEnvPresent(): boolean {
  return readSupabasePublicEnv() !== null;
}
