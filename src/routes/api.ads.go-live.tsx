import { createFileRoute } from "@tanstack/react-router";

import { activateSponsoredAd, expireDueAds, type SponsoredAdRow } from "@/lib/ads/activate-ad";
import { signedPlatformActor } from "@/lib/platform-access";

export const Route = createFileRoute("/api/ads/go-live")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as { adId?: string };
        const adId = body.adId?.trim();
        if (!adId) return Response.json({ error: "Missing ad." }, { status: 400 });
        const ctx = await signedPlatformActor(request, ["admin"]);
        if ("error" in ctx) return ctx.error;
        await expireDueAds(ctx.admin);
        const { data: ad } = await ctx.admin.from("sponsored_ads").select("*").eq("id", adId).maybeSingle();
        if (!ad) return Response.json({ error: "Ad not found." }, { status: 404 });
        if (String(ad.status) === "live") return Response.json({ ok: true });
        const live = await activateSponsoredAd(ctx.admin, { ...(ad as SponsoredAdRow), created_by_admin: true }, "admin");
        if (live.error) return Response.json({ error: live.error }, { status: 400 });
        return Response.json({ ok: true });
      },
    },
  },
});
