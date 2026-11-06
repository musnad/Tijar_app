import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";

import { corvRequestLooksSigned, parseCorvCredit } from "@/lib/payments/corv";
import { findBusinessByReceivingAccount } from "@/lib/payments/shop-server";
import { flutterwaveWebhookOk } from "@/lib/payments/flutterwave";
import { readEnvString, readSupabasePublicEnv } from "@/lib/supabase/runtime-env";

function paystackValid(raw: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const digest = createHmac("sha512", secret).update(raw).digest("hex");
  const a = Buffer.from(digest);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function markPaid(
  orderId: string | undefined,
  reference: string | undefined,
  businessId: string | undefined,
  amount: number | undefined,
  provider: string,
) {
  const env = readSupabasePublicEnv();
  const service = readEnvString("SUPABASE_SERVICE_ROLE_KEY");
  if (!env || !service) return;
  const supabase = createClient(env.VITE_SUPABASE_URL, service);
  if (orderId) {
    await supabase.from("orders").update({ status: "paid", payment_method: provider, payment_destination: "platform" }).eq("id", orderId);
    if (!businessId) {
      const { data } = await supabase.from("orders").select("business_id, total").eq("id", orderId).maybeSingle();
      businessId = data?.business_id as string | undefined;
      amount = amount ?? Number(data?.total ?? 0);
    }
  }
  if (reference) {
    await supabase.from("payments").update({ status: "success", provider_reference: reference }).eq("provider_reference", reference);
  }
  const creditRef = reference || (orderId ? `${provider}-order-${orderId}` : null);
  if (businessId && amount && amount > 0 && creditRef) {
    await supabase.rpc("credit_seller_wallet_once", {
      p_business_id: businessId,
      p_amount: amount,
      p_provider: provider,
      p_reference: creditRef,
    });
  }
}

export const Route = createFileRoute("/api/payments/webhook")({
  server: {
    handlers: {
      GET: async () => Response.json({ ok: true, provider: "tijar" }),
      POST: async ({ request }) => {
        const raw = await request.text();
        let payload: unknown = null;
        try {
          payload = raw ? (JSON.parse(raw) as unknown) : null;
        } catch {
          payload = null;
        }
        const corvCredit = parseCorvCredit(payload);
        if (corvCredit && (corvRequestLooksSigned(request, raw) || corvCredit.accountNumber)) {
          const credit = corvCredit;
          if (!credit) return Response.json({ ok: true, ignored: true });
          const env = readSupabasePublicEnv();
          const service = readEnvString("SUPABASE_SERVICE_ROLE_KEY");
          if (!env || !service) return Response.json({ ok: false }, { status: 503 });
          const supabase = createClient(env.VITE_SUPABASE_URL, service);
          const businessId = await findBusinessByReceivingAccount(supabase, credit.accountNumber);
          if (businessId && credit.reference) {
            const once = await supabase.rpc("credit_seller_wallet_once", {
              p_business_id: businessId,
              p_amount: credit.amount,
              p_provider: "corv",
              p_reference: credit.reference,
              p_account_number: credit.accountNumber,
            });
            if (once.error) {
              const existing = await supabase
                .from("wallet_credits")
                .select("id")
                .eq("provider", "corv")
                .eq("provider_reference", credit.reference)
                .maybeSingle();
              if (!existing.data) {
                await supabase.from("wallet_credits").insert({
                  business_id: businessId,
                  provider: "corv",
                  provider_reference: credit.reference,
                  amount_ngn: credit.amount,
                  account_number: credit.accountNumber,
                });
                await supabase.rpc("credit_seller_wallet", { p_business_id: businessId, p_amount: credit.amount });
              }
            }
          }
          return Response.json({ ok: true });
        }

        const flutterHash = request.headers.get("verif-hash");
        const paystackSig = request.headers.get("x-paystack-signature");
        const paystackSecret = readEnvString("PAYSTACK_SECRET_KEY");

        if (flutterHash && flutterwaveWebhookOk(flutterHash)) {
          const payload = JSON.parse(raw) as {
            event?: string;
            data?: {
              status?: string;
              tx_ref?: string;
              flw_ref?: string;
              amount?: number;
              meta?: { order_id?: string; business_id?: string };
            };
          };
          const ok =
            (payload.event === "charge.completed" || payload.event === "charge.success") &&
            (payload.data?.status === "successful" || payload.data?.status === "success");
          if (!ok) return Response.json({ ok: true, ignored: true });
          const txRef = payload.data?.tx_ref;
          const fromVa = txRef?.startsWith("tijar-biz-") ? txRef.slice("tijar-biz-".length) : undefined;
          await markPaid(
            payload.data?.meta?.order_id,
            txRef ?? payload.data?.flw_ref,
            payload.data?.meta?.business_id ?? fromVa,
            payload.data?.amount,
            "flutterwave",
          );
          return Response.json({ ok: true });
        }

        if (paystackSecret && paystackValid(raw, paystackSig, paystackSecret)) {
          const payload = JSON.parse(raw) as {
            event?: string;
            data?: { reference?: string; status?: string; amount?: number; metadata?: { order_id?: string; business_id?: string } };
          };
          if (payload.event !== "charge.success" || payload.data?.status !== "success") {
            return Response.json({ ok: true, ignored: true });
          }
          await markPaid(
            payload.data?.metadata?.order_id,
            payload.data?.reference,
            payload.data?.metadata?.business_id,
            payload.data?.amount != null ? payload.data.amount / 100 : undefined,
            "paystack",
          );
          return Response.json({ ok: true });
        }

        return Response.json({ ok: false, error: "not_configured" }, { status: 401 });
      },
    },
  },
});
