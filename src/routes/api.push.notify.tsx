import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";

import { absoluteAppUrl } from "@/lib/site-url";
import { readEnvString, readSupabasePublicEnv } from "@/lib/supabase/runtime-env";

type NotifyBody = {
  id?: string;
  recipient_id?: string;
  kind?: string;
  title?: string;
  body?: string;
  business_id?: string | null;
  video_post_id?: string | null;
  product_id?: string | null;
  listing_id?: string | null;
  order_id?: string | null;
};

type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function targetFor(row: NotifyBody): string {
  const kind = row.kind ?? "";
  if (kind === "order_update" && row.order_id) return `/shop/orders/${row.order_id}`;
  if (kind === "cart" || kind === "purchase") return "/app/orders";
  if (kind === "place_order" || kind === "place_order_paid") {
    return row.listing_id ? `/shop/order-now/${row.listing_id}` : "/shop/create-order?tab=orders";
  }
  if (row.listing_id) return `/shop/order-now/${row.listing_id}`;
  if (row.product_id) return `/shop/p/${row.product_id}`;
  if (row.video_post_id) return `/shop?v=${row.video_post_id}`;
  if (kind === "follow" || kind === "follow_back") return "/shop/notifications";
  return "/shop";
}

export const Route = createFileRoute("/api/push/notify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = readEnvString("PUSH_WEBHOOK_SECRET");
        if (!secret || request.headers.get("x-push-secret") !== secret) {
          return Response.json({ error: "Unauthorized." }, { status: 401 });
        }

        const env = readSupabasePublicEnv();
        const service = readEnvString("SUPABASE_SERVICE_ROLE_KEY");
        const publicKey = readEnvString("VAPID_PUBLIC_KEY");
        const privateKey = readEnvString("VAPID_PRIVATE_KEY");
        if (!env || !service || !publicKey || !privateKey) {
          return Response.json({ error: "Push is not configured." }, { status: 503 });
        }

        const row = (await request.json().catch(() => ({}))) as NotifyBody;
        const recipientId = row.recipient_id?.trim();
        if (!recipientId) return Response.json({ error: "Missing recipient." }, { status: 400 });

        const admin = createClient(env.VITE_SUPABASE_URL, service);
        const { data: subs } = await admin
          .from("push_subscriptions")
          .select("id, endpoint, p256dh, auth")
          .eq("profile_id", recipientId);
        const subscriptions = (subs ?? []) as SubscriptionRow[];
        if (subscriptions.length === 0) return Response.json({ ok: true, sent: 0 });

        const webPush = (await import("web-push")).default;
        webPush.setVapidDetails(readEnvString("PUSH_VAPID_SUBJECT") ?? "mailto:hello@tijar.ng", publicKey, privateKey);

        const payload = JSON.stringify({
          title: row.title ?? "TIJAR",
          body: row.body ?? "",
          url: absoluteAppUrl(targetFor(row)),
          tag: row.id ? `tijar-${row.id}` : undefined,
        });

        const stale: string[] = [];
        let sent = 0;
        await Promise.all(
          subscriptions.map(async (sub) => {
            try {
              await webPush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                payload,
              );
              sent += 1;
            } catch (err) {
              const status = (err as { statusCode?: number }).statusCode;
              if (status === 404 || status === 410) stale.push(sub.id);
            }
          }),
        );

        if (stale.length > 0) await admin.from("push_subscriptions").delete().in("id", stale);
        return Response.json({ ok: true, sent });
      },
    },
  },
});
