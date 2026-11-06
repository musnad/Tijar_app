import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  Business,
  MarketplaceOrder,
  Profile,
  Transaction,
} from "@/types/database";
import type { BusinessUpgradeRequest } from "@/services/marketplace-service";

export type AdminTransaction = Transaction & {
  businesses?: { business_name: string } | null;
};

export type AdminOrder = MarketplaceOrder & {
  businesses?: { business_name: string; public_phone?: string | null } | null;
  buyer?: { full_name: string; email: string | null; phone?: string | null } | null;
};

export type AdminPayment = {
  id: string;
  order_id: string;
  provider: string;
  status: string;
  amount: number;
  currency: string;
  created_at: string;
};

export type KycStatus =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "under_review"
  | "verified"
  | "rejected"
  | "requires_update";

export async function fetchAdminUpgradeRequests(): Promise<{
  requests: BusinessUpgradeRequest[];
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("business_upgrade_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) return { requests: [], error: error.message };
  return { requests: (data ?? []) as BusinessUpgradeRequest[], error: null };
}

export async function reviewBusinessUpgrade(
  requestId: string,
  approve: boolean,
  notes?: string,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("review_business_upgrade", {
    p_request_id: requestId,
    p_approve: approve,
    p_notes: notes?.trim() || null,
  });
  return { error: error?.message ?? null };
}

export type AdminBusiness = Business & {
  owner?: { full_name: string | null; phone: string | null; email: string | null } | null;
};

export async function fetchAdminProfiles(): Promise<{
  profiles: Profile[];
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(800);
  if (error) {
    const fallback = await supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(800);
    if (fallback.error) return { profiles: [], error: fallback.error.message };
    return { profiles: (fallback.data ?? []) as Profile[], error: null };
  }
  return { profiles: (data ?? []) as Profile[], error: null };
}

export async function fetchAdminBusinesses(): Promise<{
  businesses: AdminBusiness[];
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  const joined = await supabase
    .from("businesses")
    .select("*, owner:profiles!businesses_owner_id_fkey(full_name, phone, email)")
    .order("updated_at", { ascending: false })
    .limit(800);
  if (!joined.error) return { businesses: (joined.data ?? []) as AdminBusiness[], error: null };
  const { data, error } = await supabase.from("businesses").select("*").order("updated_at", { ascending: false }).limit(800);
  if (error) return { businesses: [], error: error.message };
  return { businesses: (data ?? []) as AdminBusiness[], error: null };
}

export async function fetchAdminOrders(): Promise<{
  orders: AdminOrder[];
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*, businesses(business_name), buyer:profiles!orders_buyer_profile_id_fkey(full_name, email)")
    .order("created_at", { ascending: false })
    .limit(400);
  if (error) {
    const fallback = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(400);
    if (fallback.error) return { orders: [], error: fallback.error.message };
    return { orders: (fallback.data ?? []) as AdminOrder[], error: null };
  }
  return { orders: (data ?? []) as AdminOrder[], error: null };
}

export async function fetchAdminTransactions(): Promise<{
  transactions: AdminTransaction[];
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("transactions")
    .select("*, businesses(business_name)")
    .order("occurred_at", { ascending: false })
    .limit(800);
  if (error) {
    const fallback = await supabase
      .from("transactions")
      .select("*")
      .order("occurred_at", { ascending: false })
      .limit(800);
    if (fallback.error) return { transactions: [], error: fallback.error.message };
    return { transactions: (fallback.data ?? []) as AdminTransaction[], error: null };
  }
  return { transactions: (data ?? []) as AdminTransaction[], error: null };
}

export async function fetchAdminPayments(): Promise<{
  payments: AdminPayment[];
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("payments")
    .select("id, order_id, provider, status, amount, currency, created_at")
    .order("created_at", { ascending: false })
    .limit(400);
  if (error) return { payments: [], error: error.message };
  return { payments: (data ?? []) as AdminPayment[], error: null };
}

export async function setBusinessVerification(
  businessId: string,
  status: KycStatus,
  notes?: string,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { data: biz } = await supabase
    .from("businesses")
    .select("id, latitude, longitude, is_published")
    .eq("id", businessId)
    .maybeSingle();
  const hasCoords = biz?.latitude != null && biz?.longitude != null;
  const patch: Record<string, unknown> = {
    verification_status: status,
  };
  if (notes?.trim()) patch.moderation_notes = notes.trim();
  if (status === "verified") {
    patch.moderation_status = "approved";
    patch.location_approved = hasCoords;
    if (biz?.is_published && !hasCoords) {
      patch.is_published = false;
    }
  }
  const { error } = await supabase.from("businesses").update(patch).eq("id", businessId);
  return { error: error?.message ?? null };
}

export async function approveAllBusinesses(): Promise<{
  applications: number;
  shops: number;
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("admin_approve_all_businesses");
  if (!error) {
    const row = (data ?? {}) as { applications?: number; shops?: number };
    return { applications: Number(row.applications ?? 0), shops: Number(row.shops ?? 0), error: null };
  }
  if (!/schema cache|could not find the function|does not exist/i.test(error.message)) {
    return { applications: 0, shops: 0, error: error.message };
  }

  const pending = await fetchAdminUpgradeRequests();
  let applications = 0;
  for (const req of pending.requests.filter((r) => r.status === "pending")) {
    const r = await reviewBusinessUpgrade(req.id, true, "Approved in bulk");
    if (!r.error) applications += 1;
  }
  const shops = await fetchAdminBusinesses();
  let approved = 0;
  for (const biz of shops.businesses) {
    if (biz.moderation_status === "suspended") continue;
    const r = await setBusinessVerification(biz.id, "verified");
    if (r.error) continue;
    if (!biz.is_published) await setBusinessPublished(biz.id, true);
    approved += 1;
  }
  return { applications, shops: approved, error: null };
}

export async function setBusinessPublished(
  businessId: string,
  published: boolean,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  if (published) {
    const { data: biz } = await supabase
      .from("businesses")
      .select("latitude, longitude")
      .eq("id", businessId)
      .maybeSingle();
    if (biz?.latitude == null || biz?.longitude == null) {
      return { error: "This shop needs a map location before it can be published. Ask the owner to save location on the business page." };
    }
  }
  const patch: Record<string, unknown> = {
    is_published: published,
    published_at: published ? new Date().toISOString() : null,
  };
  if (published) patch.location_approved = true;
  const { error } = await supabase.from("businesses").update(patch).eq("id", businessId);
  return { error: error?.message ?? null };
}

export function shopName(row: { businesses?: { business_name: string } | null; business_id?: string }): string {
  return row.businesses?.business_name ?? row.business_id?.slice(0, 8) ?? "Shop";
}
