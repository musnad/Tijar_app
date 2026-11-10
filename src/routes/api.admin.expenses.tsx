import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import { isTijarSuperAdminEmail } from "@/lib/admin";
import { findPlatformBusinessId, supabaseServiceKey } from "@/lib/payments/shop-server";
import { readSupabasePublicEnv } from "@/lib/supabase/runtime-env";

async function adminClient(request: Request) {
  const env = readSupabasePublicEnv();
  const service = supabaseServiceKey();
  if (!env || !service) {
    return { error: Response.json({ error: "Server is missing Supabase keys." }, { status: 503 }) };
  }
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return { error: Response.json({ error: "Sign in first." }, { status: 401 }) };
  }
  const userClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return { error: Response.json({ error: "Sign in first." }, { status: 401 }) };
  const admin = createClient(env.VITE_SUPABASE_URL, service);
  const { data: profile } = await admin.from("profiles").select("id, email").eq("auth_id", user.id).maybeSingle();
  const email = (profile?.email as string | null) ?? user.email ?? null;
  const { data: roleRow } = profile?.id
    ? await admin.from("platform_roles").select("role").eq("profile_id", profile.id).eq("role", "admin").maybeSingle()
    : { data: null };
  if (!isTijarSuperAdminEmail(email) && !roleRow) {
    return { error: Response.json({ error: "Admins only." }, { status: 403 }) };
  }
  return { admin, profileId: (profile?.id as string | undefined) ?? null };
}

export const Route = createFileRoute("/api/admin/expenses")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ctx = await adminClient(request);
        if ("error" in ctx) return ctx.error;
        const listed = await ctx.admin.rpc("list_tijar_expenses");
        if (!listed.error) {
          return Response.json({ expenses: listed.data ?? [] });
        }
        const { data, error } = await ctx.admin
          .from("tijar_expenses")
          .select("id, title, amount_ngn, from_profit, notes, created_at")
          .order("created_at", { ascending: false })
          .limit(400);
        if (error) {
          return Response.json(
            {
              expenses: [],
              error:
                "Run supabase/migrations/20260307000095_tijar_expenses.sql and 20260307000096_tijar_expenses_read.sql in Supabase.",
              detail: error.message,
            },
            { status: 200 },
          );
        }
        return Response.json({ expenses: data ?? [] });
      },
      POST: async ({ request }) => {
        const ctx = await adminClient(request);
        if ("error" in ctx) return ctx.error;
        const body = (await request.json()) as {
          title?: string;
          amount?: number;
          fromProfit?: boolean;
          notes?: string;
        };
        const title = body.title?.trim() ?? "";
        const amount = Number(body.amount);
        const fromProfit = body.fromProfit !== false;
        if (!title) return Response.json({ error: "Give this expense a name." }, { status: 400 });
        if (!Number.isFinite(amount) || amount <= 0) {
          return Response.json({ error: "Enter an amount greater than 0." }, { status: 400 });
        }

        const rpc = await ctx.admin.rpc("add_tijar_expense", {
          p_title: title,
          p_amount: amount,
          p_from_profit: fromProfit,
          p_notes: body.notes?.trim() || null,
        });
        if (!rpc.error) return Response.json({ ok: true, id: rpc.data });

        const inserted = await ctx.admin
          .from("tijar_expenses")
          .insert({
            title,
            amount_ngn: Math.round(amount * 100) / 100,
            from_profit: fromProfit,
            notes: body.notes?.trim() || null,
            created_by: ctx.profileId,
          })
          .select("id")
          .maybeSingle();
        if (inserted.error) {
          return Response.json(
            { error: "Run 20260307000095_tijar_expenses.sql in Supabase first.", detail: inserted.error.message },
            { status: 400 },
          );
        }
        if (fromProfit) {
          const platformId = await findPlatformBusinessId(ctx.admin);
          if (platformId) {
            const { data: wallet } = await ctx.admin
              .from("seller_wallets")
              .select("available_ngn")
              .eq("business_id", platformId)
              .maybeSingle();
            if (wallet) {
              await ctx.admin
                .from("seller_wallets")
                .update({
                  available_ngn: Math.max(Number(wallet.available_ngn ?? 0) - amount, 0),
                  updated_at: new Date().toISOString(),
                })
                .eq("business_id", platformId);
            }
          }
        }
        return Response.json({ ok: true, id: inserted.data?.id });
      },
      DELETE: async ({ request }) => {
        const ctx = await adminClient(request);
        if ("error" in ctx) return ctx.error;
        const url = new URL(request.url);
        const id = url.searchParams.get("id")?.trim() || ((await request.json().catch(() => null)) as { id?: string } | null)?.id;
        if (!id) return Response.json({ error: "Missing expense." }, { status: 400 });
        const rpc = await ctx.admin.rpc("delete_tijar_expense", { p_id: id });
        if (!rpc.error) return Response.json({ ok: true });
        const { error } = await ctx.admin.from("tijar_expenses").delete().eq("id", id);
        if (error) return Response.json({ error: error.message }, { status: 400 });
        return Response.json({ ok: true });
      },
    },
  },
});
