import { isShopIdentityVerified } from "@/lib/kyc/bytid";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export const VERIFY_BEFORE_POST =
  "Verify your NIN and complete the live face check before you post from this shop.";

export async function requireVerifiedShop(businessId: string): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("businesses")
    .select("verification_status, kyc_verified_at, kyc_face_matched, kyc_id_last4")
    .eq("id", businessId)
    .maybeSingle();
  if (error || !data) return "Could not check shop verification.";
  if (isShopIdentityVerified(data)) return null;
  return VERIFY_BEFORE_POST;
}
