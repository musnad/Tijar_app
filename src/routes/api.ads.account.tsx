import { createFileRoute } from "@tanstack/react-router";

import { findPlatformBusinessId, loadReceivingAccount, signedInAdmin } from "@/lib/payments/shop-server";

export const Route = createFileRoute("/api/ads/account")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ctx = await signedInAdmin(request);
        if ("error" in ctx) return ctx.error;
        const platformId = await findPlatformBusinessId(ctx.admin);
        if (!platformId) {
          return Response.json({ error: "TIJAR ads account is not set up yet." }, { status: 503 });
        }
        const account = await loadReceivingAccount(ctx.admin, platformId);
        if (!account) {
          return Response.json({ error: "The TIJAR virtual account is not ready yet." }, { status: 503 });
        }
        return Response.json({ account });
      },
    },
  },
});
