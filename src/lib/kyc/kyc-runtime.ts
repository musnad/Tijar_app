import type { SupabaseClient } from "@supabase/supabase-js";

import { isBytidCreditsExhausted, isShopIdentityVerified } from "@/lib/kyc/bytid";

export const UNVERIFIED_POST_LIMIT = 10;
const RUNTIME_ID = "bytid";

const POST_TABLES = ["products", "video_posts", "business_stories", "place_order_listings"] as const;

export async function persistIdentityOpen(
  admin: SupabaseClient,
  result: { ok?: boolean; httpStatus?: number; error?: string; status?: string },
  options?: { successCloses?: boolean },
): Promise<void> {
  try {
    if (result.ok) {
      if (options?.successCloses === false) return;
      await admin.from("kyc_runtime").upsert({
        id: RUNTIME_ID,
        identity_open: false,
        last_error: null,
        updated_at: new Date().toISOString(),
      });
      return;
    }
    if (!isBytidCreditsExhausted(result)) return;
    await admin.from("kyc_runtime").upsert({
      id: RUNTIME_ID,
      identity_open: true,
      last_error: (result.error ?? result.status ?? "unavailable").slice(0, 200),
      updated_at: new Date().toISOString(),
    });
  } catch {
    /* table may not exist until the SQL migration is run */
  }
}

export async function shopMayPostWithClient(
  supabase: SupabaseClient,
  businessId: string,
  business: {
    verification_status?: string | null;
    kyc_verified_at?: string | null;
    kyc_face_matched?: boolean | null;
    kyc_id_last4?: string | null;
    kyc_full_name?: string | null;
  },
): Promise<boolean> {
  if (isShopIdentityVerified(business)) return true;
  const runtime = await supabase.from("kyc_runtime").select("identity_open").eq("id", RUNTIME_ID).maybeSingle();
  if (runtime.error || !runtime.data?.identity_open) return false;
  const counts = await Promise.all(
    POST_TABLES.map((table) =>
      supabase.from(table).select("id", { count: "exact", head: true }).eq("business_id", businessId),
    ),
  );
  let total = 0;
  let readable = false;
  for (const row of counts) {
    if (row.error) continue;
    readable = true;
    total += row.count ?? 0;
  }
  if (!readable) return false;
  return total < UNVERIFIED_POST_LIMIT;
}

export function shopQueryAllowsPost(data?: {
  canPost?: boolean;
  business?: {
    verification_status?: string | null;
    kyc_verified_at?: string | null;
    kyc_face_matched?: boolean | null;
    kyc_id_last4?: string | null;
    kyc_full_name?: string | null;
  } | null;
} | null): boolean {
  if (!data?.business) return false;
  if (typeof data.canPost === "boolean") return data.canPost;
  return isShopIdentityVerified(data.business);
}
