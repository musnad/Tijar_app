import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import { rotateDueGalleryPosts } from "@/lib/agent-visibility";
import { signedPlatformActor } from "@/lib/platform-access";
import { supabaseServiceKey } from "@/lib/payments/shop-server";
import { readEnvString, readSupabasePublicEnv } from "@/lib/supabase/runtime-env";

export const Route = createFileRoute("/api/cron/agent-repost")({
  server: {
    handlers: {
      GET: async ({ request }) => run(request),
      POST: async ({ request }) => run(request),
    },
  },
});

async function run(request: Request) {
  const cronSecret = readEnvString("CRON_SECRET");
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : new URL(request.url, "https://www.tijar.ng").searchParams.get("secret") ?? "";
  const cronOk = Boolean(cronSecret && token === cronSecret);
  if (!cronOk) {
    const ctx = await signedPlatformActor(request, ["admin"]);
    if ("error" in ctx) return ctx.error;
    const posted = await rotateDueGalleryPosts(ctx.admin);
    return Response.json({ ok: true, posted });
  }
  const env = readSupabasePublicEnv();
  const service = supabaseServiceKey();
  if (!env || !service) return Response.json({ error: "Server is missing Supabase keys." }, { status: 503 });
  const admin = createClient(env.VITE_SUPABASE_URL, service);
  const posted = await rotateDueGalleryPosts(admin);
  return Response.json({ ok: true, posted });
}
