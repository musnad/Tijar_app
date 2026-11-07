import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type ShopReceivingAccount = {
  accountNumber: string;
  accountName: string;
  bankName: string;
};

async function authHeader(): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ? `Bearer ${session.access_token}` : null;
}

export async function fetchShopReceivingAccount(
  businessId: string,
): Promise<{ account: ShopReceivingAccount | null; error: string | null }> {
  const auth = await authHeader();
  if (!auth) return { account: null, error: "Sign in first." };
  const res = await fetch(`/api/payments/shop-account?businessId=${encodeURIComponent(businessId)}`, {
    headers: { Authorization: auth },
    cache: "no-store",
  });
  const json = (await res.json()) as { account?: ShopReceivingAccount | null; error?: string };
  if (!res.ok) return { account: null, error: json.error ?? "Could not load shop account." };
  return { account: json.account ?? null, error: null };
}

export async function confirmShopPayment(input: {
  businessId: string;
  amount: number;
  orderId: string;
  kind: "place_order" | "marketplace" | "bid";
  itemLabel: string;
  watchedFrom?: string;
}): Promise<{ paid: boolean; error: string | null }> {
  const auth = await authHeader();
  if (!auth) return { paid: false, error: "Sign in first." };
  const res = await fetch("/api/payments/confirm-order", {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = (await res.json()) as { paid?: boolean; error?: string };
  if (!res.ok) return { paid: false, error: json.error ?? "Could not confirm payment." };
  return { paid: Boolean(json.paid), error: json.error ?? null };
}
