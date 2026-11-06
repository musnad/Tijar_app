import { createFileRoute } from "@tanstack/react-router";

import { corvConfigured, corvTransfer } from "@/lib/payments/corv";
import { flutterwaveConfigured, flutterwaveTransfer } from "@/lib/payments/flutterwave";
import { shopAdminClient, syncCorvWallet } from "@/lib/payments/shop-server";

export const Route = createFileRoute("/api/payments/payout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as {
          businessId?: string;
          amount?: number;
          accountNumber?: string;
          accountName?: string;
          bankCode?: string;
          bankName?: string;
        };
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
          .select("payout_account_number, payout_bank_code, payout_account_name, payout_bank_name, business_name")
          .eq("id", businessId)
          .maybeSingle();
        const accountNumber = (body.accountNumber || biz?.payout_account_number || "").replace(/\D/g, "");
        const bankCode = (body.bankCode || biz?.payout_bank_code || "").trim();
        const accountName = (body.accountName || biz?.payout_account_name || "").trim();
        const bankName = (body.bankName || biz?.payout_bank_name || "Bank").trim();
        if (accountNumber.length < 8 || !bankCode) {
          return Response.json({ error: "Enter the bank and account number to send money to." }, { status: 400 });
        }

        const { data: va } = await admin
          .from("businesses")
          .select("virtual_account_number, virtual_account_reference, virtual_accounts")
          .eq("id", businessId)
          .maybeSingle();
        const extras = Array.isArray(va?.virtual_accounts)
          ? (va.virtual_accounts as Array<{ accountNumber?: string; reference?: string }>)
          : [];
        const receiving = extras.length
          ? extras
          : va?.virtual_account_number
            ? [{ accountNumber: va.virtual_account_number, reference: va.virtual_account_reference }]
            : [];
        const synced = await syncCorvWallet(admin, businessId, receiving);
        const { data: wallet } = await admin
          .from("seller_wallets")
          .select("available_ngn, pending_ngn")
          .eq("business_id", businessId)
          .maybeSingle();
        const available = synced.available || Number(wallet?.available_ngn ?? 0);
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
            note: `Payout to ${accountName || bankName} ${accountNumber}`,
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

        await admin
          .from("businesses")
          .update({
            payout_account_number: accountNumber,
            payout_account_name: accountName || null,
            payout_bank_code: bankCode,
            payout_bank_name: bankName,
            updated_at: new Date().toISOString(),
          })
          .eq("id", businessId);

        const narration = `TIJAR payout ${biz?.business_name ?? ""}`.trim();
        const reference = `tijar-po-${row.id}`;
        const sent = corvConfigured()
          ? await corvTransfer({
              bankCode,
              accountNumber,
              accountName: accountName || undefined,
              amount,
              reference,
              narration,
            })
          : await flutterwaveTransfer({
              bankCode,
              accountNumber,
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
