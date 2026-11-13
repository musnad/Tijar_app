import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";

import { absoluteAppUrl } from "@/lib/site-url";
import { readEnvString, readSupabasePublicEnv } from "@/lib/supabase/runtime-env";

export const Route = createFileRoute("/api/payments/paystack")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = readEnvString("PAYSTACK_SECRET_KEY");
        if (!secret) {
          return Response.json({ error: "Add PAYSTACK_SECRET_KEY on the server to take card payments." }, { status: 503 });
        }
        const env = readSupabasePublicEnv();
        const service = readEnvString("SUPABASE_SERVICE_ROLE_KEY");
        if (!env || !service) {
          return Response.json({ error: "Server payment setup is incomplete." }, { status: 503 });
        }
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) {
          return Response.json({ error: "Sign in to pay." }, { status: 401 });
        }
        const body = (await request.json()) as { orderId?: string };
        const orderId = body.orderId?.trim();
        if (!orderId) return Response.json({ error: "Missing order." }, { status: 400 });

        const userClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
          global: { headers: { Authorization: auth } },
        });
        const {
          data: { user },
        } = await userClient.auth.getUser();
        if (!user) return Response.json({ error: "Sign in to pay." }, { status: 401 });

        const admin = createClient(env.VITE_SUPABASE_URL, service);
        const { data: order } = await admin.from("orders").select("*").eq("id", orderId).maybeSingle();
        if (!order) return Response.json({ error: "Order not found." }, { status: 404 });

        const { data: profile } = await admin
          .from("profiles")
          .select("id, email, full_name, phone")
          .eq("auth_id", user.id)
          .maybeSingle();
        if (!profile || profile.id !== order.buyer_profile_id) {
          return Response.json({ error: "This order is not yours." }, { status: 403 });
        }

        const reference = `tijar-${order.order_number}-${Date.now().toString().slice(-6)}`;
        const amountKobo = Math.round(Number(order.total) * 100);
        const res = await fetch("https://api.paystack.co/transaction/initialize", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${secret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: profile.email || user.email || "buyer@tijar.ng",
            amount: amountKobo,
            currency: order.currency ?? "NGN",
            reference,
            callback_url: absoluteAppUrl(`/shop/orders/${orderId}`),
            metadata: { order_id: orderId, business_id: order.business_id, platform: "tijar-mobile" },
          }),
        });
        const json = (await res.json()) as {
          status?: boolean;
          message?: string;
          data?: { authorization_url?: string; reference?: string };
        };
        if (!res.ok || !json.status || !json.data?.authorization_url) {
          return Response.json({ error: json.message ?? "Could not open Paystack." }, { status: 502 });
        }

        await admin.from("payments").insert({
          order_id: orderId,
          provider: "paystack",
          status: "initiated",
          amount: order.total,
          currency: order.currency ?? "NGN",
          provider_reference: json.data.reference ?? reference,
          test_mode: secret.startsWith("sk_test"),
          metadata: { destination: "platform" },
        });
        await admin
          .from("orders")
          .update({ payment_method: "paystack", payment_destination: "platform" })
          .eq("id", orderId);

        return Response.json({ link: json.data.authorization_url, reference: json.data.reference ?? reference });
      },
    },
  },
});
