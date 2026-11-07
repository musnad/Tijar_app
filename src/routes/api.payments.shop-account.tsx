import { createFileRoute } from "@tanstack/react-router";

import { loadReceivingAccount, signedInAdmin } from "@/lib/payments/shop-server";

export const Route = createFileRoute("/api/payments/shop-account")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const businessId = new URL(request.url).searchParams.get("businessId")?.trim();
        if (!businessId) return Response.json({ error: "Missing shop." }, { status: 400 });
        const ctx = await signedInAdmin(request);
        if ("error" in ctx) return ctx.error;
        const account = await loadReceivingAccount(ctx.admin, businessId);
        return Response.json({ account }, { headers: { "Cache-Control": "no-store" } });
      },
    },
  },
});
