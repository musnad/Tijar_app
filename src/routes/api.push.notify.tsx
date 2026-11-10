import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";

import { sendFcm } from "@/lib/push/fcm";
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
        if (!env || !service) {
          return Response.json({ error: "Push is not configured." }, { status: 503 });
        }
        const publicKey = readEnvString("VAPID_PUBLIC_KEY");
        const privateKey = readEnvString("VAPID_PRIVATE_KEY");
        const fcmKey = readEnvString("FCM_SERVER_KEY");
        const fcmAccount =
          readEnvString("FCM_SERVICE_ACCOUNT_JSON") ||
          readEnvString("FIREBASE_SERVICE_ACCOUNT") ||
          readEnvString("FIREBASE_PRIVATE_KEY");
        if (!fcmKey && !fcmAccount && (!publicKey || !privateKey)) {
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

        const webSubs = subscriptions.filter((sub) => !sub.endpoint.startsWith("fcm:"));
        const webPush =
          webSubs.length > 0 && publicKey && privateKey
            ? (await import("web-push")).default
            : null;
        if (webPush) {
          webPush.setVapidDetails(
            readEnvString("PUSH_VAPID_SUBJECT") ?? "mailto:hello@tijar.ng",
            publicKey,
            privateKey,
          );
        }

        const title = row.title ?? "Tijar";
        const bodyText = row.body ?? "";
        const url = absoluteAppUrl(targetFor(row));
        const sale = row.kind === "purchase" || row.kind === "place_order" || row.kind === "place_order_paid";
        const payload = JSON.stringify({
          title: sale ? "You made a sale" : title,
          body: bodyText,
          url,
          tag: row.id ? `tijar-${row.id}` : undefined,
          sound: sale ? "sale" : "default",
        });

        const stale: string[] = [];
        let sent = 0;
        await Promise.all(
          subscriptions.map(async (sub) => {
            try {
              if (sub.endpoint.startsWith("fcm:")) {
                const token = sub.endpoint.slice(4);
                const headline = sale ? "You made a sale" : title;
                const line = bodyText.trim() || "Open Tijar to see it.";
                const channel = sale ? "tijar-sales" : "tijar-general";
                const result = await sendFcm({
                  token,
                  title: headline,
                  body: line,
                  url,
                  kind: row.kind ?? "",
                  channel,
                  tag: row.id ? `tijar-${row.id}` : "tijar",
                });
                if (result.stale) stale.push(sub.id);
                else if (result.ok) sent += 1;
                return;
              }
              if (!webPush) return;
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
