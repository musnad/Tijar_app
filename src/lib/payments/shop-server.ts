import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { corvConfigured, corvReceivedPayments, sameNuban, type CorvActivity } from "@/lib/payments/corv";
import {
  PLATFORM_FEE_SETTLE_EMAIL,
  type PaymentProcessor,
  saleFeeSplit,
  saleTopUpKeep,
  walletInboundSplit,
} from "@/lib/platform-fee";
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
  if (once.error) {
    const existing = await admin
      .from("wallet_credits")
      .select("id")
      .eq("provider", "corv")
      .eq("provider_reference", reference)
      .maybeSingle();
    if (!existing.data) {
      await admin.from("wallet_credits").insert({
        business_id: businessId,
        provider: "corv",
        provider_reference: reference,
        amount_ngn: amount,
        account_number: accountNumber,
      });
      await admin.rpc("credit_seller_wallet", { p_business_id: businessId, p_amount: amount });
    }
  }
  await applyWalletInboundFee(admin, businessId, amount, reference);
}

export async function creditCorvInbound(
  admin: SupabaseClient,
  businessId: string,
  amount: number,
  reference: string,
  accountNumber: string | null,
) {
  await creditOnce(admin, businessId, amount, reference, accountNumber);
}

async function applyWalletInboundFee(
  admin: SupabaseClient,
  businessId: string,
  landed: number,
  reference: string,
) {
  const split = walletInboundSplit(landed);
  if (split.tijarKeep <= 0 || !reference) return;
  const platformId = await findPlatformBusinessId(admin);
  if (platformId && platformId === businessId) return;

  const { data: credit } = await admin
    .from("wallet_credits")
    .select("id")
    .eq("provider", "corv")
    .eq("provider_reference", reference)
    .maybeSingle();
  if (!credit?.id) return;

  const rpc = await admin.rpc("apply_tijar_wallet_fee", {
    p_source_id: credit.id,
    p_business_id: businessId,
    p_landed: split.landed,
    p_payment_ref: reference,
  });
  if (!rpc.error) return;

  const existing = await admin
    .from("platform_fees")
    .select("id")
    .eq("source", "wallet")
    .eq("source_id", credit.id)
    .maybeSingle();
  if (existing.data) return;

  const inserted = await admin.from("platform_fees").insert({
    source: "wallet",
    source_id: credit.id,
    business_id: businessId,
    platform_business_id: platformId,
    gross_ngn: split.gross,
    fee_rate: 0.01,
    fee_ngn: split.tijarKeep,
    seller_net_ngn: split.userNet,
    settled_to_email: PLATFORM_FEE_SETTLE_EMAIL,
    payment_reference: reference,
    processor: "corv",
    corv_fee_ngn: split.corvFee,
    tijar_keep_ngn: split.tijarKeep,
    total_fee_ngn: split.corvFee + split.tijarKeep,
  });
  if (inserted.error) return;

  const { data: wallet } = await admin.from("seller_wallets").select("available_ngn").eq("business_id", businessId).maybeSingle();
  if (wallet) {
    await admin
      .from("seller_wallets")
      .update({
        available_ngn: Math.max(Number(wallet.available_ngn ?? 0) - split.tijarKeep, 0),
        updated_at: new Date().toISOString(),
      })
      .eq("business_id", businessId);
  }
  if (platformId) {
    await creditPlatformKeep(admin, platformId, split.tijarKeep, `wallet:${credit.id}`);
  }
}

async function creditPlatformKeep(admin: SupabaseClient, platformId: string, amount: number, ref: string) {
  if (amount <= 0) return;
  const once = await admin.rpc("credit_seller_wallet_once", {
    p_business_id: platformId,
    p_amount: amount,
    p_provider: "tijar_fee",
    p_reference: ref,
    p_account_number: null,
  });
  if (!once.error) return;
  await admin.from("wallet_credits").insert({
    business_id: platformId,
    provider: "tijar_fee",
    provider_reference: ref,
    amount_ngn: amount,
  });
  await admin.rpc("credit_seller_wallet", { p_business_id: platformId, p_amount: amount });
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

export async function fastWalletAvailable(admin: SupabaseClient, businessId: string): Promise<number> {
  const [owned, { data: outs }] = await Promise.all([
    ownedNubans(admin, businessId),
    admin.from("payout_requests").select("amount_ngn, status").eq("business_id", businessId),
  ]);
  let inbound = 0;
  if (corvConfigured()) {
    const inbox = await corvReceivedPayments();
    for (const nuban of owned) {
      inbound += inbox
        .filter((row) => row.direction === "in" && sameNuban(row.accountNumber, nuban))
        .reduce((sum, row) => sum + row.amount, 0);
    }
  }
  const reserved = (outs ?? [])
    .filter((row) => ["paid", "processing", "pending"].includes(String(row.status)))
    .reduce((sum, row) => sum + Number(row.amount_ngn ?? 0), 0);
  return Math.max(inbound - reserved, 0);
}

export async function syncCorvWallet(
  admin: SupabaseClient,
  businessId: string,
  accounts: Array<{ accountNumber?: string | null; reference?: string | null }>,
): Promise<{ activity: CorvActivity[]; available: number }> {
  const activity: CorvActivity[] = [];
  if (corvConfigured()) {
    const inbox = await corvReceivedPayments();
    for (const row of accounts) {
      const nuban = String(row.accountNumber ?? "").replace(/\D/g, "");
      if (nuban.length < 8) continue;
      for (const tx of inbox) {
        if (!sameNuban(tx.accountNumber, nuban)) continue;
        if (!activity.some((existing) => existing.reference === tx.reference)) activity.push(tx);
        if (tx.direction !== "in") continue;
        await creditOnce(admin, businessId, tx.amount, tx.reference, nuban);
      }
    }
  }
  const [{ data: outs }, { data: wallet }] = await Promise.all([
    admin.from("payout_requests").select("amount_ngn, status").eq("business_id", businessId),
    admin.from("seller_wallets").select("pending_ngn").eq("business_id", businessId).maybeSingle(),
  ]);
  const inbound = activity.filter((row) => row.direction === "in").reduce((sum, row) => sum + row.amount, 0);
  const reserved = (outs ?? [])
    .filter((row) => ["paid", "processing", "pending"].includes(String(row.status)))
    .reduce((sum, row) => sum + Number(row.amount_ngn ?? 0), 0);
  const paidQ = await admin.from("platform_fees").select("fee_ngn").eq("business_id", businessId).is("voided_at", null);
  const earnedQ = await admin.from("platform_fees").select("fee_ngn").eq("platform_business_id", businessId).is("voided_at", null);
  let feesPaid = paidQ.data;
  let feesEarned = earnedQ.data;
  if (paidQ.error || earnedQ.error) {
    const fallback = await Promise.all([
      admin.from("platform_fees").select("fee_ngn").eq("business_id", businessId),
      admin.from("platform_fees").select("fee_ngn").eq("platform_business_id", businessId),
    ]);
    feesPaid = fallback[0].data;
    feesEarned = fallback[1].data;
  }
  const taken = (feesPaid ?? []).reduce((sum, row) => sum + Number(row.fee_ngn ?? 0), 0);
  const earned = (feesEarned ?? []).reduce((sum, row) => sum + Number(row.fee_ngn ?? 0), 0);
  const available = Math.max(inbound - reserved - taken + earned, 0);
  await admin.from("seller_wallets").upsert(
    {
      business_id: businessId,
      available_ngn: available,
      pending_ngn: Number(wallet?.pending_ngn ?? 0),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "business_id" },
  );
  return { activity, available };
}

export async function signedInAdmin(
  request: Request,
): Promise<{ admin: SupabaseClient; profile: ShopProfile } | { error: Response }> {
  const env = readSupabasePublicEnv();
  if (!env) {
    return {
      error: Response.json({ error: "Supabase URL/anon key is missing on the server." }, { status: 503 }),
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
  if (!user) return { error: Response.json({ error: "Sign in first." }, { status: 401 }) };
  const service = supabaseServiceKey();
  const admin = service ? createClient(env.VITE_SUPABASE_URL, service) : userClient;
  const { data: profile } = await admin
    .from("profiles")
    .select("id, email, full_name, phone")
    .eq("auth_id", user.id)
    .maybeSingle();
  if (!profile) return { error: Response.json({ error: "Profile not found." }, { status: 403 }) };
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

export type ShopReceivingAccount = {
  accountNumber: string;
  accountName: string;
  bankName: string;
};

export async function loadReceivingAccount(
  admin: SupabaseClient,
  businessId: string,
): Promise<ShopReceivingAccount | null> {
  const { data } = await admin
    .from("businesses")
    .select("business_name, virtual_account_name, virtual_account_number, virtual_account_bank_name, virtual_accounts")
    .eq("id", businessId)
    .maybeSingle();
  const primary = String(data?.virtual_account_number ?? "").replace(/\D/g, "");
  if (primary.length >= 8) {
    return {
      accountNumber: primary,
      accountName: String(data?.virtual_account_name || data?.business_name || "TIJAR shop"),
      bankName: String(data?.virtual_account_bank_name || "Bank"),
    };
  }
  const extras = Array.isArray(data?.virtual_accounts) ? data.virtual_accounts : [];
  for (const extra of extras) {
    const rec = extra as { accountNumber?: string; account_number?: string; accountName?: string; bankName?: string };
    const nuban = String(rec.accountNumber || rec.account_number || "").replace(/\D/g, "");
    if (nuban.length >= 8) {
      return {
        accountNumber: nuban,
        accountName: String(rec.accountName || data?.business_name || "TIJAR shop"),
        bankName: String(rec.bankName || "Bank"),
      };
    }
  }
  return null;
}

function amountsMatch(received: number, expected: number): boolean {
  if (!Number.isFinite(received) || !Number.isFinite(expected) || expected <= 0) return false;
  if (Math.abs(received - expected) <= 2) return true;
  const net = Math.round(expected * 0.99 * 100) / 100;
  return Math.abs(received - net) <= 5;
}

export async function findRecentShopCredit(
  businessId: string,
  expectedAmount: number,
  sinceIso?: string | null,
): Promise<CorvActivity | null> {
  const env = readSupabasePublicEnv();
  const service = supabaseServiceKey();
  if (!env || !service || !corvConfigured()) return null;
  const admin = createClient(env.VITE_SUPABASE_URL, service);
  const since = sinceIso ? Date.parse(sinceIso) : Date.now() - 20 * 60 * 1000;
  const floor = Number.isFinite(since) ? since - 2 * 60 * 1000 : Date.now() - 22 * 60 * 1000;
  const nubans = await ownedNubans(admin, businessId);
  const inbox = await corvReceivedPayments();
  const matches = inbox.filter((row) => {
    if (row.direction !== "in") return false;
    if (![...nubans].some((nuban) => sameNuban(row.accountNumber, nuban))) return false;
    if (!amountsMatch(row.amount, expectedAmount)) return false;
    const at = row.createdAt ? Date.parse(row.createdAt) : Date.now();
    return Number.isFinite(at) && at >= floor;
  });
  return matches[0] ?? null;
}

export async function notifyShopBuyerEvent(
  admin: SupabaseClient,
  input: {
    businessId: string;
    buyerId: string;
    kind: string;
    title: string;
    body: string;
  },
) {
  const { data: shop } = await admin.from("businesses").select("owner_id").eq("id", input.businessId).maybeSingle();
  if (!shop?.owner_id || shop.owner_id === input.buyerId) return;
  const payload = {
    p_recipient: shop.owner_id,
    p_actor: input.buyerId,
    p_kind: input.kind,
    p_title: input.title,
    p_body: input.body,
    p_business_id: input.businessId,
    p_video_post_id: null as string | null,
  };
  const first = await admin.rpc("notify_activity", payload);
  if (first.error) {
    await admin.rpc("notify_activity", { ...payload, p_kind: "comment" });
  }
}

export async function findPlatformBusinessId(admin: SupabaseClient): Promise<string | null> {
  const rpc = await admin.rpc("tijar_platform_business_id");
  if (!rpc.error && rpc.data) return String(rpc.data);
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", PLATFORM_FEE_SETTLE_EMAIL)
    .maybeSingle();
  if (!profile?.id) return null;
  const { data: shop } = await admin.from("businesses").select("id").eq("owner_id", profile.id).order("created_at", { ascending: true }).limit(1).maybeSingle();
  return (shop?.id as string | undefined) ?? null;
}

export async function applyPlatformFee(
  admin: SupabaseClient,
  input: {
    source: "marketplace" | "place_order" | "bid";
    sourceId: string;
    businessId: string;
    gross: number;
    processor?: PaymentProcessor;
    paymentReference?: string | null;
  },
): Promise<{ fee: number; net: number; tijarKeep: number }> {
  const processor = input.processor ?? "corv";
  const split = saleFeeSplit(input.gross, processor);
  const rpc = await admin.rpc("apply_tijar_platform_fee", {
    p_source: input.source,
    p_source_id: input.sourceId,
    p_business_id: input.businessId,
    p_gross: split.gross,
    p_processor: processor,
    p_payment_ref: input.paymentReference ?? null,
  });
  if (!rpc.error) {
    const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
    return {
      fee: Number((row as { fee_ngn?: number } | null)?.fee_ngn ?? split.totalFee),
      net: Number((row as { seller_net_ngn?: number } | null)?.seller_net_ngn ?? split.sellerNet),
      tijarKeep: split.tijarKeep,
    };
  }

  const existing = await admin
    .from("platform_fees")
    .select("id")
    .eq("source", input.source)
    .eq("source_id", input.sourceId)
    .maybeSingle();
  if (existing.data) return { fee: split.totalFee, net: split.sellerNet, tijarKeep: split.tijarKeep };

  let alreadyKeep = 0;
  const paymentRef = input.paymentReference?.trim();
  if (paymentRef) {
    const { data: walletFees } = await admin
      .from("platform_fees")
      .select("id, fee_ngn")
      .eq("source", "wallet")
      .eq("payment_reference", paymentRef)
      .is("voided_at", null);
    alreadyKeep = (walletFees ?? []).reduce((n, row) => n + Number(row.fee_ngn ?? 0), 0);
    if ((walletFees ?? []).length > 0) {
      await admin
        .from("platform_fees")
        .update({ voided_at: new Date().toISOString() })
        .eq("source", "wallet")
        .eq("payment_reference", paymentRef)
        .is("voided_at", null);
    }
  }
  const debit = saleTopUpKeep(split.tijarKeep, alreadyKeep);

  const platformId = await findPlatformBusinessId(admin);
  const inserted = await admin.from("platform_fees").insert({
    source: input.source,
    source_id: input.sourceId,
    business_id: input.businessId,
    platform_business_id: platformId,
    gross_ngn: split.gross,
    fee_rate: split.rate,
    fee_ngn: split.tijarKeep,
    seller_net_ngn: split.sellerNet,
    settled_to_email: PLATFORM_FEE_SETTLE_EMAIL,
    payment_reference: paymentRef || null,
    processor,
    corv_fee_ngn: split.corvFee,
    tijar_keep_ngn: split.tijarKeep,
    total_fee_ngn: split.totalFee,
  });
  if (inserted.error) return { fee: split.totalFee, net: split.sellerNet, tijarKeep: split.tijarKeep };

  if (input.source === "marketplace") {
    await admin.from("orders").update({ platform_fee_ngn: split.totalFee, seller_net_ngn: split.sellerNet }).eq("id", input.sourceId);
  } else if (input.source === "place_order") {
    await admin.from("place_order_requests").update({ platform_fee_ngn: split.totalFee, seller_net_ngn: split.sellerNet }).eq("id", input.sourceId);
  }

  if (debit > 0) {
    const { data: wallet } = await admin.from("seller_wallets").select("available_ngn").eq("business_id", input.businessId).maybeSingle();
    if (wallet) {
      await admin
        .from("seller_wallets")
        .update({
          available_ngn: Math.max(Number(wallet.available_ngn ?? 0) - debit, 0),
          updated_at: new Date().toISOString(),
        })
        .eq("business_id", input.businessId);
    }
    if (platformId) {
      await creditPlatformKeep(admin, platformId, debit, `${input.source}:${input.sourceId}`);
    }
  }
  return { fee: split.totalFee, net: split.sellerNet, tijarKeep: split.tijarKeep };
}
