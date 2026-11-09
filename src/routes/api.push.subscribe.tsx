import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";

import { readEnvString, readSupabasePublicEnv } from "@/lib/supabase/runtime-env";

type PushBody = {
  fcmToken?: string;
  subscription?: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
};

export const Route = createFileRoute("/api/push/subscribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = readSupabasePublicEnv();
        const service = readEnvString("SUPABASE_SERVICE_ROLE_KEY");
        if (!env || !service) {
          return Response.json({ error: "Server push setup is incomplete." }, { status: 503 });
        }
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) {
          return Response.json({ error: "Sign in to enable notifications." }, { status: 401 });
        }

        const body = (await request.json().catch(() => ({}))) as PushBody;
        const fcmToken = body.fcmToken?.trim();
        const endpoint = fcmToken ? `fcm:${fcmToken}` : body.subscription?.endpoint?.trim();
        const p256dh = fcmToken ? "fcm" : body.subscription?.keys?.p256dh?.trim();
        const keyAuth = fcmToken ? "fcm" : body.subscription?.keys?.auth?.trim();
        if (!endpoint || !p256dh || !keyAuth) {
          return Response.json({ error: "Invalid subscription." }, { status: 400 });
        }

        const userClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
          global: { headers: { Authorization: auth } },
        });
        const {
          data: { user },
        } = await userClient.auth.getUser();
        if (!user) return Response.json({ error: "Sign in to enable notifications." }, { status: 401 });

        const admin = createClient(env.VITE_SUPABASE_URL, service);
        const { data: profile } = await admin.from("profiles").select("id").eq("auth_id", user.id).maybeSingle();
        if (!profile) return Response.json({ error: "Profile not found." }, { status: 404 });

        const { error } = await admin.from("push_subscriptions").upsert(
          {
            profile_id: profile.id,
            endpoint,
            p256dh,
            auth: keyAuth,
            user_agent: request.headers.get("user-agent") ?? null,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "endpoint" },
        );
        if (error) return Response.json({ error: "Could not save subscription." }, { status: 500 });
        return Response.json({ ok: true });
      },

      DELETE: async ({ request }) => {
        const env = readSupabasePublicEnv();
        const service = readEnvString("SUPABASE_SERVICE_ROLE_KEY");
        if (!env || !service) {
          return Response.json({ error: "Server push setup is incomplete." }, { status: 503 });
        }
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) {
          return Response.json({ error: "Sign in first." }, { status: 401 });
        }
        const body = (await request.json().catch(() => ({}))) as PushBody;
        const endpoint = body.subscription?.endpoint?.trim();
        if (!endpoint) return Response.json({ error: "Missing subscription." }, { status: 400 });

        const userClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
          global: { headers: { Authorization: auth } },
        });
        const {
          data: { user },
        } = await userClient.auth.getUser();
        if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

        const admin = createClient(env.VITE_SUPABASE_URL, service);
        const { data: profile } = await admin.from("profiles").select("id").eq("auth_id", user.id).maybeSingle();
        if (!profile) return Response.json({ error: "Profile not found." }, { status: 404 });

        await admin.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("profile_id", profile.id);
        return Response.json({ ok: true });
      },
    },
  },
});
