import { createFileRoute } from "@tanstack/react-router";

import { activateSponsoredAd, expireDueAds, type SponsoredAdRow } from "@/lib/ads/activate-ad";
import { signedShopUser } from "@/lib/platform-access";

export const Route = createFileRoute("/api/ads/pay-wallet")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as { adId?: string };
        const adId = body.adId?.trim();
        if (!adId) return Response.json({ error: "Missing ad." }, { status: 400 });
        const ctx = await signedShopUser(request);
        if ("error" in ctx) return ctx.error;
        await expireDueAds(ctx.admin);
        const { data: ad } = await ctx.admin.from("sponsored_ads").select("*").eq("id", adId).maybeSingle();
        if (!ad) return Response.json({ error: "Ad not found." }, { status: 404 });
        if (String(ad.status) === "live") return Response.json({ paid: true });
        const member = await ctx.admin
          .from("business_members")
          .select("id")
          .eq("business_id", ad.business_id)
          .eq("profile_id", ctx.profileId)
          .maybeSingle();
        const owner = await ctx.admin.from("businesses").select("owner_id").eq("id", ad.business_id).maybeSingle();
        if (!member.data && owner.data?.owner_id !== ctx.profileId) {
          return Response.json({ error: "This ad is not for your shop." }, { status: 403 });
        }
        const amount = Number(ad.amount_ngn ?? 0);
        const { data: wallet } = await ctx.admin
          .from("seller_wallets")
          .select("available_ngn, pending_ngn")
          .eq("business_id", ad.business_id)
          .maybeSingle();
        const available = Number(wallet?.available_ngn ?? 0);
        if (amount > 0 && available < amount) {
          return Response.json(
            {
              paid: false,
              error: `Wallet has ${Math.floor(available)} naira. Deposit or transfer the rest.`,
              available,
            },
            { status: 400 },
          );
        }
        if (amount > 0) {
          const next = Math.max(0, available - amount);
          if (wallet) {
            await ctx.admin.from("seller_wallets").update({ available_ngn: next }).eq("business_id", ad.business_id);
          } else {
            await ctx.admin.from("seller_wallets").insert({
              business_id: ad.business_id,
              available_ngn: 0,
              pending_ngn: 0,
            });
            return Response.json({ paid: false, error: "Wallet is empty. Deposit first." }, { status: 400 });
          }
          await ctx.admin.from("wallet_credits").insert({
            business_id: ad.business_id,
            provider: "tijar-ads",
            provider_reference: `ad:${adId}`,
            amount_ngn: -amount,
          });
        }
        const live = await activateSponsoredAd(ctx.admin, ad as SponsoredAdRow, `wallet:${ctx.profileId}`);
        if (live.error) return Response.json({ error: live.error }, { status: 400 });
        return Response.json({ paid: true, available: Math.max(0, available - amount) });
      },
    },
  },
});
