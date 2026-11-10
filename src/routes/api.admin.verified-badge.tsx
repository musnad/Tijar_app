import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import { isTijarSuperAdminEmail } from "@/lib/admin";
import { supabaseServiceKey } from "@/lib/payments/shop-server";
import { readSupabasePublicEnv } from "@/lib/supabase/runtime-env";

export const Route = createFileRoute("/api/admin/verified-badge")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = readSupabasePublicEnv();
        const service = supabaseServiceKey();
        if (!env || !service) {
          return Response.json({ error: "Server is missing Supabase keys." }, { status: 503 });
        }
        const auth = request.headers.get("authorization");
        if (!auth?.startsWith("Bearer ")) {
          return Response.json({ error: "Sign in first." }, { status: 401 });
        }
        const body = (await request.json()) as { businessId?: string; on?: boolean };
        const businessId = body.businessId?.trim();
        if (!businessId) return Response.json({ error: "Missing shop." }, { status: 400 });

        const userClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
          global: { headers: { Authorization: auth } },
        });
        const {
          data: { user },
        } = await userClient.auth.getUser();
        if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });

        const admin = createClient(env.VITE_SUPABASE_URL, service);
        const { data: profile } = await admin
          .from("profiles")
          .select("id, email")
          .eq("auth_id", user.id)
          .maybeSingle();
        const email = (profile?.email as string | null) ?? user.email ?? null;
        const { data: roleRow } = profile?.id
          ? await admin.from("platform_roles").select("role").eq("profile_id", profile.id).eq("role", "admin").maybeSingle()
          : { data: null };
        const allowed = isTijarSuperAdminEmail(email) || Boolean(roleRow);
        if (!allowed) {
          return Response.json({ error: "Admins only." }, { status: 403 });
        }

        const on = Boolean(body.on);
        const { data: shop, error: shopErr } = await admin.from("businesses").select("id, owner_id").eq("id", businessId).maybeSingle();
        if (shopErr || !shop) return Response.json({ error: "Shop not found." }, { status: 404 });

        const { error } = await admin
          .from("businesses")
          .update({ verified_badge: on, updated_at: new Date().toISOString() })
          .eq("id", businessId);
        if (error) return Response.json({ error: error.message }, { status: 400 });

        if (on) {
          await admin
            .from("verified_badge_requests")
            .update({
              status: "approved",
              note: "Assigned by admin",
              reviewed_by: profile?.id ?? null,
              reviewed_at: new Date().toISOString(),
            })
            .eq("business_id", businessId)
            .eq("status", "pending");
        }

        return Response.json({
          ok: true,
          on,
          message: on ? "Blue tick assigned." : "Blue tick removed.",
        });
      },
    },
  },
});
