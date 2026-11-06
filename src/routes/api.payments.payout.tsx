import { createFileRoute } from "@tanstack/react-router";

import { corvConfigured, corvTransfer } from "@/lib/payments/corv";
import { flutterwaveConfigured, flutterwaveTransfer } from "@/lib/payments/flutterwave";
import { shopAdminClient } from "@/lib/payments/shop-server";

export const Route = createFileRoute("/api/payments/payout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as { businessId?: string; amount?: number };
        const businessId = body.businessId?.trim();
        const amount = Number(body.amount);
        if (!businessId || !Number.isFinite(amount) || amount < 100) {
          return Response.json({ error: "Enter an amount of at least ₦100." }, { status: 400 });
        }

        const ctx = await shopAdminClient(request, businessId);
        if ("error" in ctx) return ctx.error;
        const admin = ctx.admin;

        const { data: biz } = await admin
          .from("businesses")
          .select("payout_account_number, payout_bank_code, payout_account_name, business_name")
          .eq("id", businessId)
          .maybeSingle();
        if (!biz?.payout_account_number || !biz.payout_bank_code) {
          return Response.json({ error: "Add the bank account you want to cash out to first." }, { status: 400 });
        }

        const { data: wallet } = await admin
          .from("seller_wallets")
          .select("available_ngn, pending_ngn")
          .eq("business_id", businessId)
          .maybeSingle();
        const available = Number(wallet?.available_ngn ?? 0);
        const pending = Number(wallet?.pending_ngn ?? 0);
        if (amount > available) {
          return Response.json({ error: `You can withdraw up to ₦${available.toLocaleString("en-NG")}.` }, { status: 400 });
        }

        const canSend = corvConfigured() || flutterwaveConfigured();
        const { data: row, error: insErr } = await admin
          .from("payout_requests")
          .insert({
            business_id: businessId,
            amount_ngn: amount,
            status: canSend ? "processing" : "pending",
            note: `Payout to ${biz.payout_account_name ?? "shop account"}`,
          })
          .select("id")
          .single();
        if (insErr || !row) return Response.json({ error: insErr?.message ?? "Could not create payout." }, { status: 500 });

        await admin
          .from("seller_wallets")
          .update({
            available_ngn: available - amount,
            pending_ngn: pending + amount,
            updated_at: new Date().toISOString(),
          })
          .eq("business_id", businessId);

        if (!canSend) {
          return Response.json({
            ok: true,
            status: "pending",
            message: "Payout requested. It will send when Corv or Flutterwave transfers are connected.",
          });
        }

        const narration = `TIJAR payout ${biz.business_name ?? ""}`.trim();
        const reference = `tijar-po-${row.id}`;
        const sent = corvConfigured()
          ? await corvTransfer({
              bankCode: biz.payout_bank_code,
              accountNumber: biz.payout_account_number,
              accountName: biz.payout_account_name ?? undefined,
              amount,
              reference,
              narration,
            })
          : await flutterwaveTransfer({
              bankCode: biz.payout_bank_code,
              accountNumber: biz.payout_account_number,
              amount,
              reference,
              narration,
            });

        if (sent.error) {
          await admin.from("payout_requests").update({ status: "failed", note: sent.error }).eq("id", row.id);
          await admin
            .from("seller_wallets")
            .update({
              available_ngn: available,
              pending_ngn: pending,
              updated_at: new Date().toISOString(),
            })
            .eq("business_id", businessId);
          return Response.json({ error: sent.error }, { status: 502 });
        }
        await admin
          .from("payout_requests")
          .update({ status: "paid", provider_reference: sent.reference })
          .eq("id", row.id);
        await admin
          .from("seller_wallets")
          .update({ pending_ngn: pending, updated_at: new Date().toISOString() })
          .eq("business_id", businessId);
        return Response.json({ ok: true, status: "paid" });
      },
    },
  },
});
