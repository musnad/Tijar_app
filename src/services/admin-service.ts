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

export type AdminPlatformFee = {
  id: string;
  source: string;
  source_id: string;
  business_id: string;
  platform_business_id: string | null;
  gross_ngn: number;
  fee_ngn: number;
  seller_net_ngn: number;
  settled_to_email: string;
  created_at: string;
  voided_at?: string | null;
  processor?: string | null;
  tijar_keep_ngn?: number | null;
  businesses?: { business_name: string } | null;
};

export async function fetchAdminPlatformFees(): Promise<{
  fees: AdminPlatformFee[];
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  const joined = await supabase
    .from("platform_fees")
    .select("*, businesses(business_name)")
    .is("voided_at", null)
    .order("created_at", { ascending: false })
    .limit(800);
  if (!joined.error) return { fees: (joined.data ?? []) as AdminPlatformFee[], error: null };
  const withVoid = await supabase
    .from("platform_fees")
    .select("*, businesses(business_name)")
    .order("created_at", { ascending: false })
    .limit(800);
  if (!withVoid.error) {
    const rows = (withVoid.data ?? []) as AdminPlatformFee[];
    return { fees: rows.filter((row) => !row.voided_at), error: null };
  }
  const { data, error } = await supabase.from("platform_fees").select("*").order("created_at", { ascending: false }).limit(800);
  if (error) return { fees: [], error: error.message };
  return { fees: (data ?? []) as AdminPlatformFee[], error: null };
}

export type AdminTijarExpense = {
  id: string;
  title: string;
  amount_ngn: number;
  from_profit: boolean;
  notes: string | null;
  created_at: string;
};

async function adminAuthHeader(): Promise<Record<string, string>> {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export async function fetchAdminTijarExpenses(): Promise<{
  expenses: AdminTijarExpense[];
  error: string | null;
}> {
  const headers = await adminAuthHeader();
  if (headers.Authorization) {
    try {
      const res = await fetch("/api/admin/expenses", { headers, cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        expenses?: AdminTijarExpense[];
        error?: string;
      };
      if (Array.isArray(json.expenses)) {
        return { expenses: json.expenses, error: json.error ?? null };
      }
    } catch {
      /* fall through */
    }
  }

  const supabase = getSupabaseBrowserClient();
  const listed = await supabase.rpc("list_tijar_expenses");
  if (!listed.error) return { expenses: (listed.data ?? []) as AdminTijarExpense[], error: null };
  const { data, error } = await supabase
    .from("tijar_expenses")
    .select("id, title, amount_ngn, from_profit, notes, created_at")
    .order("created_at", { ascending: false })
    .limit(400);
  if (error) return { expenses: [], error: error.message };
  return { expenses: (data ?? []) as AdminTijarExpense[], error: null };
}

export async function addAdminTijarExpense(input: {
  title: string;
  amount: number;
  fromProfit: boolean;
  notes?: string;
}): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const headers = await adminAuthHeader();
  if (headers.Authorization) {
    try {
      const res = await fetch("/api/admin/expenses", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: input.title.trim(),
          amount: input.amount,
          fromProfit: input.fromProfit,
          notes: input.notes?.trim() || null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) return { error: null };
      if (json.error) return { error: json.error };
    } catch {
      /* fall through */
    }
  }
  const { error } = await supabase.rpc("add_tijar_expense", {
    p_title: input.title.trim(),
    p_amount: input.amount,
    p_from_profit: input.fromProfit,
    p_notes: input.notes?.trim() || null,
  });
  return { error: error?.message ?? null };
}

export async function deleteAdminTijarExpense(id: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const headers = await adminAuthHeader();
  if (headers.Authorization) {
    try {
      const res = await fetch(`/api/admin/expenses?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers,
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) return { error: null };
      if (json.error) return { error: json.error };
    } catch {
      /* fall through */
    }
  }
  const { error } = await supabase.rpc("delete_tijar_expense", { p_id: id });
  return { error: error?.message ?? null };
}

export async function fetchAdminAgents(): Promise<{ agents: Array<{ profileId: string }>; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return { agents: [], error: "Sign in first." };
  try {
    const res = await fetch("/api/admin/agents", {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { agents?: Array<{ profileId: string }>; error?: string };
    if (!res.ok) return { agents: [], error: json.error ?? "Could not load agents." };
    return { agents: json.agents ?? [], error: null };
  } catch {
    return { agents: [], error: "Could not load agents." };
  }
}

export async function setAdminAgent(profileId: string, on: boolean): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const rpc = await supabase.rpc("set_tijar_agent", { p_profile_id: profileId, p_on: on });
  if (!rpc.error) return { error: null };
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return { error: rpc.error.message };
  const res = await fetch("/api/admin/agents", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ profileId, on }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.ok) return { error: null };
  return { error: json.error ?? rpc.error.message };
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
    // Do not grant the public tick. Admin assigns verified_badge separately.
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

export async function setBusinessVerifiedBadge(
  businessId: string,
  on: boolean,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("set_business_verified_badge", {
    p_business_id: businessId,
    p_on: on,
  });
  if (!error) return { error: null };

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) {
    try {
      const res = await fetch("/api/admin/verified-badge", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ businessId, on }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) return { error: null };
      if (json.error) return { error: json.error };
    } catch {
      /* fall through */
    }
  }

  if (!/schema cache|could not find the function|does not exist|admins only/i.test(error.message)) {
    return { error: error.message };
  }
  const fallback = await supabase.from("businesses").update({ verified_badge: on }).eq("id", businessId);
  return { error: fallback.error?.message ?? null };
}

export type VerifiedBadgeRequest = {
  id: string;
  business_id: string;
  profile_id: string;
  status: "pending" | "approved" | "rejected";
  note: string | null;
  created_at: string;
  eligibility?: {
    nin_verified?: boolean;
    account_days?: number;
    post_count?: number;
    profile_complete?: boolean;
    missing?: string[];
  } | null;
  businesses?: { business_name: string; verification_status?: string | null; kyc_full_name?: string | null } | null;
};

export async function fetchVerifiedBadgeRequests(): Promise<{
  requests: VerifiedBadgeRequest[];
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  const joined = await supabase
    .from("verified_badge_requests")
    .select("*, businesses(business_name, verification_status, kyc_full_name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (!joined.error) return { requests: (joined.data ?? []) as VerifiedBadgeRequest[], error: null };
  const { data, error } = await supabase
    .from("verified_badge_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    const missing = /schema cache|does not exist|could not find the table|404/i.test(error.message);
    return { requests: [], error: missing ? null : error.message };
  }
  return { requests: (data ?? []) as VerifiedBadgeRequest[], error: null };
}

export async function reviewVerifiedBadgeRequest(
  requestId: string,
  approve: boolean,
  notes?: string,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("review_verified_badge_request", {
    p_request_id: requestId,
    p_approve: approve,
    p_notes: notes?.trim() || null,
  });
  return { error: error?.message ?? null };
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
