import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { corvAccountActivity, corvConfigured, corvMerchantBalance, type CorvActivity } from "@/lib/payments/corv";
import { readEnvString, readSupabasePublicEnv } from "@/lib/supabase/runtime-env";

export type ShopProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
};

export function supabaseServiceKey(): string | undefined {
  return (
    readEnvString("SUPABASE_SERVICE_ROLE_KEY") ||
    readEnvString("SUPABASE_SERVICE_KEY") ||
    readEnvString("SERVICE_ROLE_KEY")
  );
}

export async function shopAdminClient(
  request: Request,
  businessId: string,
): Promise<{ admin: SupabaseClient; profile: ShopProfile } | { error: Response }> {
  const env = readSupabasePublicEnv();
  if (!env) {
    return {
      error: Response.json(
        { error: "Supabase URL/anon key is missing on the server.", missing: ["VITE_SUPABASE_URL"] },
        { status: 503 },
      ),
    };
  }
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return { error: Response.json({ error: "Sign in first." }, { status: 401 }) };
  }
  const userClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return { error: Response.json({ error: "Sign in first." }, { status: 401 }) };
  }

  const service = supabaseServiceKey();
  const admin = service ? createClient(env.VITE_SUPABASE_URL, service) : userClient;
  const { data: profile } = await admin
    .from("profiles")
    .select("id, email, full_name, phone")
    .eq("auth_id", user.id)
    .maybeSingle();
  if (!profile) {
    return { error: Response.json({ error: "Profile not found." }, { status: 403 }) };
  }
  const { data: owned } = await admin
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("owner_id", profile.id)
    .maybeSingle();
  const { data: member } = await admin
    .from("business_members")
    .select("business_id")
    .eq("business_id", businessId)
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (!owned && !member) {
    return { error: Response.json({ error: "Only shop staff can manage this wallet." }, { status: 403 }) };
  }
  return {
    admin,
    profile: {
      id: profile.id as string,
      email: (profile.email as string | null) ?? user.email ?? null,
      full_name: (profile.full_name as string | null) ?? null,
      phone: (profile.phone as string | null) ?? null,
    },
  };
}

async function creditOnce(
  admin: SupabaseClient,
  businessId: string,
  amount: number,
  reference: string,
  accountNumber: string | null,
) {
  const once = await admin.rpc("credit_seller_wallet_once", {
    p_business_id: businessId,
    p_amount: amount,
    p_provider: "corv",
    p_reference: reference,
    p_account_number: accountNumber,
  });
  if (!once.error) return;
  const existing = await admin
    .from("wallet_credits")
    .select("id")
    .eq("provider", "corv")
    .eq("provider_reference", reference)
    .maybeSingle();
  if (existing.data) return;
  await admin.from("wallet_credits").insert({
    business_id: businessId,
    provider: "corv",
    provider_reference: reference,
    amount_ngn: amount,
    account_number: accountNumber,
  });
  await admin.rpc("credit_seller_wallet", { p_business_id: businessId, p_amount: amount });
}

export async function syncCorvWallet(
  admin: SupabaseClient,
  businessId: string,
  accounts: Array<{ accountNumber?: string | null; reference?: string | null }>,
): Promise<{ activity: CorvActivity[]; available: number }> {
  const activity: CorvActivity[] = [];
  if (corvConfigured()) {
    for (const row of accounts) {
      const nuban = String(row.accountNumber ?? "");
      const rows = await corvAccountActivity(nuban, row.reference);
      activity.push(...rows);
      for (const tx of rows) {
        if (tx.direction !== "in") continue;
        await creditOnce(admin, businessId, tx.amount, tx.reference, tx.accountNumber ?? nuban);
      }
    }
  }
  const { data: wallet } = await admin
    .from("seller_wallets")
    .select("available_ngn")
    .eq("business_id", businessId)
    .maybeSingle();
  const inbound = activity.filter((row) => row.direction === "in").reduce((sum, row) => sum + row.amount, 0);
  const outbound = activity.filter((row) => row.direction === "out").reduce((sum, row) => sum + row.amount, 0);
  let available = Number(wallet?.available_ngn ?? 0);
  if (available <= 0 && inbound > 0) available = Math.max(inbound - outbound, 0);
  if (available <= 0 && accounts.length) {
    const merchant = await corvMerchantBalance();
    if (merchant != null && merchant > 0) available = merchant;
  }
  return { activity, available };
}
