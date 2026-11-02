import { createFileRoute } from "@tanstack/react-router";

import { checkRateLimit } from "@/lib/api/rate-limit";
import { elevenLabsKeyFingerprint } from "@/lib/elevenlabs/client";
import { openaiKeyFingerprint, readOpenAiConfig } from "@/lib/openai/client";
import { readXaiConfig, xaiKeyFingerprint } from "@/lib/xai/client";
import {
  fetchBusinessCategoriesServer,
  isSupabaseEnvPresent,
  pingSupabaseServer,
} from "@/lib/supabase/server-health";
import { supabaseEnvDiagnostics } from "@/lib/supabase/runtime-env";
import { getConfiguredSiteOrigin } from "@/lib/site-url";

export const Route = createFileRoute("/api/supabase-health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authPing = await pingSupabaseServer();
        const categories = await fetchBusinessCategoriesServer();
        // Presence / length / masked hint only — never the full secret.
        const openai = readOpenAiConfig();
        const openaiFinger = openaiKeyFingerprint(openai.apiKey);
        const elevenFinger = elevenLabsKeyFingerprint();
        const xaiFinger = xaiKeyFingerprint(readXaiConfig().apiKey);

        return Response.json({
          env: {
            supabaseConfigured: isSupabaseEnvPresent(),
            publicAppUrl: getConfiguredSiteOrigin() || null,
            appEnv: import.meta.env.VITE_APP_ENV ?? "development",
            keysPresent: {
              ...supabaseEnvDiagnostics(),
              OPENAI_API_KEY: openaiFinger.present,
              OPENAI_API_KEY_FORMAT_OK: openaiFinger.formatOk,
              OPENAI_API_KEY_LENGTH: openaiFinger.length,
              OPENAI_API_KEY_HINT: openaiFinger.hint,
              ELEVENLABS_API_KEY: elevenFinger.present,
              ELEVENLABS_API_KEY_FORMAT_OK: elevenFinger.formatOk,
              ELEVENLABS_API_KEY_LENGTH: elevenFinger.length,
              ELEVENLABS_API_KEY_HINT: elevenFinger.hint,
              XAI_API_KEY: xaiFinger.present,
              XAI_API_KEY_FORMAT_OK: xaiFinger.formatOk,
              XAI_API_KEY_LENGTH: xaiFinger.length,
              XAI_API_KEY_HINT: xaiFinger.hint,
            },
          },
          auth: authPing,
          database: categories.error
            ? {
                ok: false,
                message: categories.error.message,
                hint: "Run supabase/migrations/20260307000000_phase0_foundation.sql in the SQL editor, then seed_business_categories.sql.",
              }
            : {
                ok: true,
                categories: categories.data?.length ?? 0,
              },
        });
      },
    },
  },
});
