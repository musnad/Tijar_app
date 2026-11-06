import { createFileRoute } from "@tanstack/react-router";

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
        const nkenne = readNkenneConfig();
        const finger = nkenneKeyFingerprint(nkenne.apiKey);
        const openai = readOpenAiConfig();
        const openaiFinger = openaiKeyFingerprint(openai.apiKey);
        const elevenFinger = elevenLabsKeyFingerprint();
        const xaiFinger = xaiKeyFingerprint(readXaiConfig().apiKey);

        let nkenneProbe: { ok: boolean; providerStatus: number | null; message: string } | null = null;
        const wantsProbe = new URL(request.url).searchParams.get("nkenne") === "1";
        if (wantsProbe) {
          const limit = checkRateLimit("nkenne-probe", 2, 60_000);
          if (!limit.allowed) {
            nkenneProbe = { ok: false, providerStatus: null, message: "Probe rate-limited. Try again in a minute." };
          } else if (!nkenne.apiKey) {
            nkenneProbe = { ok: false, providerStatus: null, message: "NKENNEAI_API_KEY missing on server." };
          } else {
            try {
              const res = await fetch(`${nkenne.baseUrl}/api/translate/with-api-key`, {
                method: "POST",
                headers: {
                  Authorization: nkenne.apiKey,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  text: "Hi",
                  fromLanguage: "English",
                  toLanguage: "Yoruba",
                }),
              });
              const body = (await res.json().catch(() => null)) as { message?: string; tokensRemaining?: number } | null;
              nkenneProbe = {
                ok: res.ok,
                providerStatus: res.status,
                message:
                  typeof body?.message === "string"
                    ? body.message.slice(0, 120)
                    : res.ok
                      ? "ok"
                      : `HTTP ${res.status}`,
              };
            } catch {
              nkenneProbe = { ok: false, providerStatus: null, message: "Could not reach NKENNEAi from this server." };
            }
          }
        }

        return Response.json({
          env: {
            supabaseConfigured: isSupabaseEnvPresent(),
            publicAppUrl: getConfiguredSiteOrigin() || null,
            appEnv: import.meta.env.VITE_APP_ENV ?? "development",
            keysPresent: {
              ...supabaseEnvDiagnostics(),
              NKENNEAI_API_KEY: finger.present,
              NKENNEAI_API_KEY_FORMAT_OK: finger.formatOk,
              NKENNEAI_API_KEY_LENGTH: finger.length,
              NKENNEAI_API_KEY_HINT: finger.hint,
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
            nkenneProbe,
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
