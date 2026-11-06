import { createFileRoute } from "@tanstack/react-router";

import { corvConfigured, corvCreateVirtualAccount } from "@/lib/payments/corv";
import { shopAdminClient } from "@/lib/payments/shop-server";

export const Route = createFileRoute("/api/payments/virtual-account")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const businessId = url.searchParams.get("businessId")?.trim();
        if (!businessId) return Response.json({ error: "Missing shop." }, { status: 400 });
        const ctx = await shopAdminClient(request, businessId);
        if ("error" in ctx) return ctx.error;
        const { data: biz } = await ctx.admin
          .from("businesses")
          .select(
            "business_name, virtual_account_name, virtual_account_number, virtual_account_bank_name, virtual_account_bank_code, virtual_account_reference, payout_account_name, payout_account_number, payout_bank_name, payout_bank_code",
          )
          .eq("id", businessId)
          .maybeSingle();
        const { data: wallet } = await ctx.admin
          .from("seller_wallets")
          .select("available_ngn, pending_ngn")
          .eq("business_id", businessId)
          .maybeSingle();
        const { data: credits } = await ctx.admin
          .from("wallet_credits")
          .select("id, business_id, provider, provider_reference, amount_ngn, account_number, created_at")
          .eq("business_id", businessId)
          .order("created_at", { ascending: false })
          .limit(40);
        return Response.json({
          configured: corvConfigured(),
          account: biz?.virtual_account_number
            ? {
                accountName: biz.virtual_account_name,
                accountNumber: biz.virtual_account_number,
                bankName: biz.virtual_account_bank_name,
                bankCode: biz.virtual_account_bank_code,
                reference: biz.virtual_account_reference,
              }
            : null,
          payout: biz?.payout_account_number
            ? {
                accountName: biz.payout_account_name,
                accountNumber: biz.payout_account_number,
                bankName: biz.payout_bank_name,
                bankCode: biz.payout_bank_code,
              }
            : null,
          wallet: {
            available_ngn: Number(wallet?.available_ngn ?? 0),
            pending_ngn: Number(wallet?.pending_ngn ?? 0),
          },
          credits: credits ?? [],
        });
      },
      POST: async ({ request }) => {
        if (!corvConfigured()) {
          return Response.json(
            { error: "Add CORV_SECRET_KEY on the server to issue shop accounts." },
            { status: 503 },
          );
        }
        const body = (await request.json()) as { businessId?: string; bvn?: string };
        const businessId = body.businessId?.trim();
        const bvn = body.bvn?.replace(/\D/g, "") || undefined;
        if (!businessId) return Response.json({ error: "Missing shop." }, { status: 400 });
        if (bvn && bvn.length !== 11) {
          return Response.json({ error: "BVN must be 11 digits." }, { status: 400 });
        }
        const ctx = await shopAdminClient(request, businessId);
        if ("error" in ctx) return ctx.error;

        const { data: biz } = await ctx.admin
          .from("businesses")
          .select(
            "business_name, virtual_account_name, virtual_account_number, virtual_account_bank_name, virtual_account_bank_code, virtual_account_reference",
          )
          .eq("id", businessId)
          .maybeSingle();
        if (biz?.virtual_account_number) {
          return Response.json({
            ok: true,
            account: {
              accountName: biz.virtual_account_name,
              accountNumber: biz.virtual_account_number,
              bankName: biz.virtual_account_bank_name,
              bankCode: biz.virtual_account_bank_code,
              reference: biz.virtual_account_reference,
            },
          });
        }

        const accountName = String(biz?.business_name || ctx.profile.full_name || "TIJAR shop").slice(0, 80);
        const created = await corvCreateVirtualAccount({
          reference: `tijar-biz-${businessId}`,
          accountName,
          email: ctx.profile.email || `shop-${businessId.slice(0, 8)}@tijar.ng`,
          phone: ctx.profile.phone ?? undefined,
          bvn,
        });
        if (created.error || !created.account) {
          return Response.json(
            { error: created.error ?? "Could not create virtual account.", needsBvn: created.needsBvn },
            { status: created.needsBvn ? 400 : 502 },
          );
        }

        await ctx.admin
          .from("businesses")
          .update({
            virtual_account_name: created.account.accountName,
            virtual_account_number: created.account.accountNumber,
            virtual_account_bank_name: created.account.bankName,
            virtual_account_bank_code: created.account.bankCode,
            virtual_account_reference: created.account.reference ?? `tijar-biz-${businessId}`,
            virtual_account_provider: "corv",
            updated_at: new Date().toISOString(),
          })
          .eq("id", businessId);
        await ctx.admin.rpc("credit_seller_wallet", { p_business_id: businessId, p_amount: 0 });

        return Response.json({ ok: true, account: created.account });
      },
    },
  },
});
