import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { corvAccountActivity, corvConfigured, sameNuban, type CorvActivity } from "@/lib/payments/corv";
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

export async function findBusinessByReceivingAccount(
  admin: SupabaseClient,
  accountNumber: string | null | undefined,
): Promise<string | undefined> {
  const nuban = (accountNumber ?? "").replace(/\D/g, "");
  if (nuban.length < 8) return undefined;
  const { data: direct } = await admin
    .from("businesses")
    .select("id")
    .eq("virtual_account_number", nuban)
    .maybeSingle();
  if (direct?.id) return direct.id as string;
  const { data: rows } = await admin
    .from("businesses")
    .select("id, virtual_account_number, virtual_accounts")
    .not("virtual_account_number", "is", null)
    .limit(500);
  for (const row of rows ?? []) {
    if (sameNuban(row.virtual_account_number as string | null, nuban)) return row.id as string;
    const extras = Array.isArray(row.virtual_accounts) ? row.virtual_accounts : [];
    for (const extra of extras) {
      const rec = extra as { accountNumber?: string; account_number?: string };
      if (sameNuban(rec.accountNumber || rec.account_number, nuban)) return row.id as string;
    }
  }
  const extraOnly = await admin.from("businesses").select("id, virtual_accounts").not("virtual_accounts", "is", null).limit(500);
  for (const row of extraOnly.data ?? []) {
    const extras = Array.isArray(row.virtual_accounts) ? row.virtual_accounts : [];
    for (const extra of extras) {
      const rec = extra as { accountNumber?: string; account_number?: string };
      if (sameNuban(rec.accountNumber || rec.account_number, nuban)) return row.id as string;
    }
  }
  return undefined;
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

async function ownedNubans(admin: SupabaseClient, businessId: string): Promise<Set<string>> {
  const { data } = await admin
    .from("businesses")
    .select("virtual_account_number, virtual_accounts")
    .eq("id", businessId)
    .maybeSingle();
  const numbers = new Set<string>();
  const primary = String(data?.virtual_account_number ?? "").replace(/\D/g, "");
  if (primary.length >= 8) numbers.add(primary);
  const extras = Array.isArray(data?.virtual_accounts) ? data.virtual_accounts : [];
  for (const extra of extras) {
    const rec = extra as { accountNumber?: string; account_number?: string };
    const nuban = String(rec.accountNumber || rec.account_number || "").replace(/\D/g, "");
    if (nuban.length >= 8) numbers.add(nuban);
  }
  return numbers;
}

function creditBelongsToShop(
  accountNumber: string | null | undefined,
  owned: Set<string>,
): boolean {
  const nuban = String(accountNumber ?? "").replace(/\D/g, "");
  if (nuban.length < 8) return true;
  if (!owned.size) return true;
  return owned.has(nuban);
}

export async function fastWalletAvailable(admin: SupabaseClient, businessId: string): Promise<number> {
  const [owned, { data: credits }, { data: outs }] = await Promise.all([
    ownedNubans(admin, businessId),
    admin.from("wallet_credits").select("amount_ngn, account_number").eq("business_id", businessId),
    admin.from("payout_requests").select("amount_ngn, status").eq("business_id", businessId),
  ]);
  const credited = (credits ?? [])
    .filter((row) => creditBelongsToShop(row.account_number as string | null, owned))
    .reduce((sum, row) => sum + Number(row.amount_ngn ?? 0), 0);
  const reserved = (outs ?? [])
    .filter((row) => ["paid", "processing", "pending"].includes(String(row.status)))
    .reduce((sum, row) => sum + Number(row.amount_ngn ?? 0), 0);
  return Math.max(credited - reserved, 0);
}

export async function syncCorvWallet(
  admin: SupabaseClient,
  businessId: string,
  accounts: Array<{ accountNumber?: string | null; reference?: string | null }>,
): Promise<{ activity: CorvActivity[]; available: number }> {
  const owned = accounts
    .map((row) => String(row.accountNumber ?? "").replace(/\D/g, ""))
    .filter((nuban) => nuban.length >= 8);
  const activity: CorvActivity[] = [];
  if (corvConfigured()) {
    for (const row of accounts) {
      const nuban = String(row.accountNumber ?? "").replace(/\D/g, "");
      if (nuban.length < 8) continue;
      const rows = await corvAccountActivity(nuban, row.reference);
      for (const tx of rows) {
        if (tx.accountNumber && !sameNuban(tx.accountNumber, nuban)) continue;
        const stamped = { ...tx, accountNumber: tx.accountNumber || nuban };
        if (!activity.some((existing) => existing.reference === stamped.reference)) activity.push(stamped);
        if (stamped.direction !== "in") continue;
        await creditOnce(admin, businessId, stamped.amount, stamped.reference, nuban);
      }
    }
  }
  const inbound = activity.filter((row) => row.direction === "in").reduce((sum, row) => sum + row.amount, 0);
  const outbound = activity.filter((row) => row.direction === "out").reduce((sum, row) => sum + row.amount, 0);
  const ledger = await fastWalletAvailable(admin, businessId);
  const available = Math.max(ledger, owned.length ? inbound - outbound : 0, 0);
  return { activity, available };
}
