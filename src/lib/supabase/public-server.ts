import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { isSupabaseConfigured, getSupabaseEnv } from "@/config/env";

/** Anon Supabase client for public SSR (no browser session). */
export function getSupabasePublicServerClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  const env = getSupabaseEnv();
  return createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
