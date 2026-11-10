import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import { activateSponsoredAd, expireDueAds, type SponsoredAdRow } from "@/lib/ads/activate-ad";
import { signedPlatformActor } from "@/lib/platform-access";
import { findPlatformBusinessId, findRecentShopCredit, loadReceivingAccount, supabaseServiceKey, syncCorvWallet } from "@/lib/payments/shop-server";
import { readEnvString, readSupabasePublicEnv } from "@/lib/supabase/runtime-env";

export const Route = createFileRoute("/api/cron/ads")({
  server: {
    handlers: {
      GET: async ({ request }) => run(request),
      POST: async ({ request }) => run(request),
    },
  },
});

async function run(request: Request) {
  const cronSecret = readEnvString("CRON_SECRET");
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : new URL(request.url, "https://www.tijar.ng").searchParams.get("secret") ?? "";
  const cronOk = Boolean(cronSecret && token === cronSecret);
  if (!cronOk) {
    const ctx = await signedPlatformActor(request, ["admin"]);
    if ("error" in ctx) return ctx.error;
    return Response.json(await syncAds(ctx.admin));
  }
  const env = readSupabasePublicEnv();
  const service = supabaseServiceKey();
  if (!env || !service) return Response.json({ error: "Server is missing Supabase keys." }, { status: 503 });
  const admin = createClient(env.VITE_SUPABASE_URL, service);
  return Response.json(await syncAds(admin));
}

async function syncAds(admin: ReturnType<typeof createClient>) {
  const ended = await expireDueAds(admin);
  const platformId = await findPlatformBusinessId(admin);
  let paid = 0;
  if (platformId) {
    const account = await loadReceivingAccount(admin, platformId);
    if (account) {
      await syncCorvWallet(admin, platformId, [{ accountNumber: account.accountNumber, reference: null }]);
      const pending = await admin.from("sponsored_ads").select("*").eq("status", "pending_payment").limit(40);
      for (const row of pending.data ?? []) {
        const amount = Number(row.amount_ngn ?? 0);
        if (!(amount > 0)) continue;
        const credit = await findRecentShopCredit(platformId, amount, row.created_at as string);
        if (!credit) continue;
        const live = await activateSponsoredAd(admin, row as SponsoredAdRow, credit.reference);
        if (!live.error) paid += 1;
      }
    }
  }
  return { ok: true, ended, paid };
}
