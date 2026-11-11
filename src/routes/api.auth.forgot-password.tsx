import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { absoluteAuthUrl } from "@/lib/site-url";
import { readSupabasePublicEnv } from "@/lib/supabase/runtime-env";

const bodySchema = z.object({
  email: z.string().trim().email(),
});

export const Route = createFileRoute("/api/auth/forgot-password")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = readSupabasePublicEnv();
        if (!env) {
          return Response.json({ error: "Sign-in is not configured." }, { status: 503 });
        }
        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return Response.json({ error: "Enter a valid email." }, { status: 400 });
        }

        // Implicit flow so the email link works on any device (browser PKCE does not).
        const auth = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
            flowType: "implicit",
          },
        });
        const redirectTo = absoluteAuthUrl("/reset-password");
        const { error } = await auth.auth.resetPasswordForEmail(parsed.data.email, { redirectTo });
        if (error) {
          const message = error.message.toLowerCase();
          if (message.includes("rate") || message.includes("seconds")) {
            return Response.json({ error: error.message }, { status: 429 });
          }
          return Response.json({ error: error.message }, { status: 400 });
        }
        return Response.json({ sent: true });
      },
    },
  },
});
