import { createFileRoute } from "@tanstack/react-router";

import { activateSponsoredAd, expireDueAds, type SponsoredAdRow } from "@/lib/ads/activate-ad";
import { isTijarSuperAdminEmail } from "@/lib/admin";
import { findPlatformBusinessId, findRecentShopCredit, loadReceivingAccount, signedInAdmin, syncCorvWallet } from "@/lib/payments/shop-server";

export const Route = createFileRoute("/api/ads/confirm")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as { adId?: string; watchedFrom?: string };
        const adId = body.adId?.trim();
        if (!adId) return Response.json({ error: "Missing ad." }, { status: 400 });
        const ctx = await signedInAdmin(request);
        if ("error" in ctx) return ctx.error;
        await expireDueAds(ctx.admin);

        const { data: ad } = await ctx.admin.from("sponsored_ads").select("*").eq("id", adId).maybeSingle();
        if (!ad) return Response.json({ error: "Ad not found." }, { status: 404 });
        const owner = String(ad.profile_id);
        const adminUser = isTijarSuperAdminEmail(ctx.profile.email);
        if (owner !== ctx.profile.id && !adminUser) {
          return Response.json({ error: "This ad is not yours." }, { status: 403 });
        }
        if (String(ad.status) === "live") return Response.json({ paid: true });
        if (!["pending_payment", "draft"].includes(String(ad.status))) {
          return Response.json({ error: "This campaign is not waiting for payment." }, { status: 400 });
        }

        const platformId = await findPlatformBusinessId(ctx.admin);
        if (!platformId) return Response.json({ error: "TIJAR ads account is not set up yet." }, { status: 503 });
        const account = await loadReceivingAccount(ctx.admin, platformId);
        if (!account) return Response.json({ error: "The TIJAR virtual account is not ready yet." }, { status: 503 });
        await syncCorvWallet(ctx.admin, platformId, [{ accountNumber: account.accountNumber, reference: null }]);
        const amount = Number(ad.amount_ngn ?? 0);
        const since = body.watchedFrom || (ad.created_at as string) || new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
        let credit = await findRecentShopCredit(platformId, amount, since);
        if (!credit) {
          credit = await findRecentShopCredit(platformId, amount, new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString());
        }
        if (!credit) {
          return Response.json({
            paid: false,
            error: "No matching transfer on the TIJAR ads account yet. Send the exact amount, wait a moment, then tap I’ve paid.",
          });
        }
        const live = await activateSponsoredAd(ctx.admin, ad as SponsoredAdRow, credit.reference);
        if (live.error) return Response.json({ error: live.error }, { status: 400 });
        return Response.json({ paid: true, reference: credit.reference });
      },
    },
  },
});
