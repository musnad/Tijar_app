import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";

import { mapCreditRpcError } from "@/lib/ai/rpc-errors";
import { DEFAULT_AI_SERVICES } from "@/lib/ai/services";
import { assertTranslateOrigin, jsonSecure, requireAuthenticatedUser } from "@/lib/api/security";
import { readSupabasePublicEnv } from "@/lib/supabase/runtime-env";

export const Route = createFileRoute("/api/ai/wallet")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = assertTranslateOrigin(request);
        if (!origin.ok) return jsonSecure({ error: { code: origin.code, message: origin.message } }, { status: origin.status });
        const auth = await requireAuthenticatedUser(request);
        if (!auth.ok) return jsonSecure({ error: { code: auth.code, message: "Sign in to see AI credits." } }, { status: auth.status });
        const env = readSupabasePublicEnv();
        const services = Object.values(DEFAULT_AI_SERVICES).map((row) => ({
          slug: row.slug,
          displayName: row.displayName,
          creditCost: row.creditCost,
        }));
        if (!env) {
          return jsonSecure({ balance: null, skipped: true, services });
        }
        const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: request.headers.get("authorization") ?? "" } },
        });
        const ensured = await supabase.rpc("ensure_ai_wallet");
        if (ensured.error) {
          const mapped = mapCreditRpcError(ensured.error);
          return jsonSecure({ error: { code: mapped.code, message: mapped.message }, balance: null, services }, { status: mapped.status });
        }
        const catalog = await supabase.from("ai_services").select("slug, display_name, credit_cost");
        const wallet = ensured.data as { balance_credits?: number } | null;
        const fromDb = (catalog.data ?? []).map((row) => ({
          slug: row.slug,
          displayName: row.display_name,
          creditCost: row.credit_cost,
        }));
        return jsonSecure({
          balance: wallet?.balance_credits ?? null,
          skipped: false,
          services: fromDb.length ? fromDb : services,
        });
      },
    },
  },
});
