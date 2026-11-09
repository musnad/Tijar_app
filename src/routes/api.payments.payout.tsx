import { createFileRoute } from "@tanstack/react-router";

import { corvConfigured, corvResolveAccount, corvTransfer } from "@/lib/payments/corv";
import { flutterwaveConfigured, flutterwaveTransfer } from "@/lib/payments/flutterwave";
import { shopAdminClient, syncCorvWallet } from "@/lib/payments/shop-server";
import { consumeTransferPin, setShopTransferPin, shopHasTransferPin } from "@/lib/payments/transfer-pin";

export const Route = createFileRoute("/api/payments/payout")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const businessId = url.searchParams.get("businessId")?.trim();
        const accountNumber = (url.searchParams.get("accountNumber") ?? "").replace(/\D/g, "");
        const bankCode = (url.searchParams.get("bankCode") ?? "").trim();
        if (!businessId) return Response.json({ error: "Missing shop." }, { status: 400 });
        const ctx = await shopAdminClient(request, businessId);
        if ("error" in ctx) return ctx.error;
        if (accountNumber.length < 8 || !bankCode) return Response.json({ accountName: null });
        const accountName = corvConfigured() ? await corvResolveAccount({ bankCode, accountNumber }) : null;
        const pinStatus = await shopHasTransferPin(ctx.admin, businessId);
        return Response.json({
          accountName,
          hasTransferPin: pinStatus.hasPin,
          pinLockedUntil: pinStatus.lockedUntil,
        });
      },
      PUT: async ({ request }) => {
        const body = (await request.json()) as {
          businessId?: string;
          pin?: string;
          confirmPin?: string;
          currentPin?: string;
        };
        const businessId = body.businessId?.trim();
        if (!businessId) return Response.json({ error: "Missing shop." }, { status: 400 });
        const ctx = await shopAdminClient(request, businessId);
        if ("error" in ctx) return ctx.error;
        const saved = await setShopTransferPin(ctx.admin, businessId, {
          pin: body.pin ?? "",
          confirmPin: body.confirmPin ?? "",
          currentPin: body.currentPin,
        });
        if (!saved.ok) return Response.json({ error: saved.error, code: saved.code }, { status: saved.status });
        return Response.json({ ok: true, hasTransferPin: true, message: "Transfer PIN saved." });
      },
      POST: async ({ request }) => {
        const body = (await request.json()) as {
          businessId?: string;
          amount?: number;
          pin?: string;
          accountNumber?: string;
          accountName?: string;
          bankCode?: string;
          bankName?: string;
        };
        const businessId = body.businessId?.trim();
        const amount = Math.round(Number(body.amount) * 100) / 100;
        if (!businessId || !Number.isFinite(amount) || amount < 100) {
          return Response.json({ error: "Enter an amount of at least ₦100." }, { status: 400 });
        }

        const ctx = await shopAdminClient(request, businessId);
        if ("error" in ctx) return ctx.error;
        const admin = ctx.admin;

        const { data: biz } = await admin
          .from("businesses")
          .select(
            "payout_account_number, payout_bank_code, payout_account_name, payout_bank_name, business_name, virtual_account_number, virtual_account_reference, virtual_accounts",
          )
          .eq("id", businessId)
          .maybeSingle();
        const accountNumber = (body.accountNumber || biz?.payout_account_number || "").replace(/\D/g, "");
        const bankCode = (body.bankCode || biz?.payout_bank_code || "").trim();
        let accountName = (body.accountName || biz?.payout_account_name || "").trim();
        const bankName = (body.bankName || biz?.payout_bank_name || "Bank").trim();
        if (accountNumber.length < 8 || !bankCode) {
          return Response.json({ error: "Enter the bank and account number to send to." }, { status: 400 });
        }
        if (corvConfigured() && !accountName) {
          accountName = (await corvResolveAccount({ bankCode, accountNumber })) ?? "";
        }

        const extras = Array.isArray(biz?.virtual_accounts)
          ? (biz.virtual_accounts as Array<{ accountNumber?: string; account_number?: string; reference?: string }>)
          : [];
        const receiving = [
          biz?.virtual_account_number
            ? { accountNumber: biz.virtual_account_number as string, reference: biz.virtual_account_reference as string | null }
            : null,
          ...extras.map((row) => ({
            accountNumber: row.accountNumber || row.account_number,
            reference: row.reference ?? (biz?.virtual_account_reference as string | null),
          })),
        ].filter((row): row is { accountNumber: string; reference: string | null } => Boolean(row?.accountNumber));
        const { data: wallet } = await admin
          .from("seller_wallets")
          .select("available_ngn, pending_ngn")
          .eq("business_id", businessId)
          .maybeSingle();
        const synced = await syncCorvWallet(admin, businessId, receiving);
        const available = synced.available;
        const pending = Number(wallet?.pending_ngn ?? 0);
        if (amount > available) {
          return Response.json(
            { error: `You can withdraw up to ₦${available.toLocaleString("en-NG")}. Refresh the wallet, then try again.` },
            { status: 400 },
          );
        }

        const canSend = corvConfigured() || flutterwaveConfigured();
        if (!canSend) {
          return Response.json({ error: "Payouts are not connected on the server yet." }, { status: 503 });
        }

        const pinCheck = await consumeTransferPin(ctx.admin, businessId, body.pin);
        if (!pinCheck.ok) {
          return Response.json({ error: pinCheck.error, code: pinCheck.code }, { status: pinCheck.status });
        }

        const narration = `TIJAR payout ${biz?.business_name ?? ""}`.trim();
        const reference = `tijar-po-${crypto.randomUUID()}`;
        const sent = corvConfigured()
          ? await corvTransfer({
              bankCode,
              accountNumber,
              accountName: accountName || undefined,
              amount,
              reference,
              narration,
              sourceAccountNumber: biz?.virtual_account_number as string | undefined,
            })
          : await flutterwaveTransfer({
              bankCode,
              accountNumber,
              amount,
              reference,
              narration,
            });

        if (sent.error) {
          return Response.json({ error: sent.error }, { status: 502 });
        }

        await admin.rpc("credit_seller_wallet", { p_business_id: businessId, p_amount: 0 });
        await admin.from("seller_wallets").upsert(
          {
            business_id: businessId,
            available_ngn: Math.max(available - amount, 0),
            pending_ngn: pending,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "business_id" },
        );
        await admin.from("payout_requests").insert({
          business_id: businessId,
          amount_ngn: amount,
          status: "paid",
          provider_reference: sent.reference,
          note: `Sent to ${accountName || bankName} ${accountNumber}`,
        });
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

        return Response.json({
          ok: true,
          status: "paid",
          message: `₦${amount.toLocaleString("en-NG")} sent to ${accountName || bankName}.`,
        });
      },
    },
  },
});
