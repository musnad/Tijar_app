import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseEnvPresent } from "@/lib/supabase/runtime-env";

import { newIdempotencyKey } from "@/lib/ai/idempotency";

/** Bearer + Idempotency-Key for paid AI POSTs. One key per intentional action. */
export async function aiClientHeaders(extra?: HeadersInit, idempotencyKey?: string): Promise<HeadersInit> {
  let token: string | null = null;
  if (isSupabaseEnvPresent()) {
    try {
      const { data } = await getSupabaseBrowserClient().auth.getSession();
      token = data.session?.access_token ?? null;
    } catch {
      token = null;
    }
  }
  return {
    ...(extra ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    "Idempotency-Key": idempotencyKey?.trim() || newIdempotencyKey(),
  };
}
