import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";

import {
  assertJsonContentType,
  assertTranslateOrigin,
  jsonSecure,
  readJsonBody,
  requireAuthenticatedUser,
} from "@/lib/api/security";
import { isAiServiceSlug } from "@/lib/ai/services";
import { readSupabasePublicEnv } from "@/lib/supabase/runtime-env";

export const Route = createFileRoute("/api/ai/admin/services")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const origin = assertTranslateOrigin(request);
        if (!origin.ok) return jsonSecure({ error: { code: origin.code, message: origin.message } }, { status: origin.status });
        const auth = await requireAuthenticatedUser(request);
        if (!auth.ok) return jsonSecure({ error: { code: auth.code, message: auth.message } }, { status: auth.status });
        const media = assertJsonContentType(request);
        if (!media.ok) return jsonSecure({ error: { code: media.code, message: media.message } }, { status: media.status });
        const parsed = await readJsonBody(request, 4_096);
        if (!parsed.ok) return jsonSecure({ error: { code: parsed.code, message: parsed.message } }, { status: parsed.status });
        const body = parsed.body as { slug?: string; creditCost?: number };
        if (!body.slug || !isAiServiceSlug(body.slug) || !Number.isInteger(body.creditCost) || (body.creditCost ?? 0) < 0) {
          return jsonSecure({ error: { code: "VALIDATION", message: "Need a known service slug and a whole-number cost." } }, { status: 400 });
        }
        const env = readSupabasePublicEnv();
        if (!env) {
          return jsonSecure({ error: { code: "NOT_CONFIGURED", message: "Database is not configured." } }, { status: 503 });
        }
        const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: request.headers.get("authorization") ?? "" } },
        });
        const { data, error } = await supabase.rpc("update_ai_service_cost", {
          p_slug: body.slug,
          p_cost: body.creditCost,
        });
        if (error) {
          const admin = /ADMIN_ONLY/i.test(error.message);
          return jsonSecure(
            { error: { code: admin ? "FORBIDDEN" : "RPC_ERROR", message: admin ? "Admins only." : "Could not update cost." } },
            { status: admin ? 403 : 400 },
          );
        }
        return jsonSecure({ service: data });
      },
    },
  },
});
