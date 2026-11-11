"use client";

import { useEffect, useState } from "react";

import { hardRedirect, resolveAppEntry } from "@/features/auth/route-guards";
import { WebAuthLayout } from "@/features/auth/web-auth-layout";
import { completePasswordRecovery } from "@/lib/auth/complete-recovery-session";
import { isPasswordRecovery, readGoogleAccountMode, readOAuthNext } from "@/lib/auth-recovery";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchCurrentProfile, updateProfile } from "@/services/profile-service";

export function AuthCallbackScreen() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = getSupabaseBrowserClient();
      const recovered = await completePasswordRecovery(supabase);
      if (cancelled) return;
      if (recovered.recovery || isPasswordRecovery()) {
        if (recovered.error) {
          setError(recovered.error);
          return;
        }
        hardRedirect("/reset-password");
        return;
      }
      if (recovered.error && !cancelled) {
        setError(recovered.error);
        return;
      }
      const session = recovered.session ?? (await supabase.auth.getSession()).data.session;
      if (!session) {
        if (!cancelled) setError("Could not finish Google sign-in.");
        return;
      }
      const mode = readGoogleAccountMode();
      const { profile } = await fetchCurrentProfile();
      if (profile && mode) {
        await updateProfile(profile.id, { account_mode: mode, active_mode: mode });
      }
      const next = readOAuthNext();
      const { profile: fresh } = await fetchCurrentProfile();
      if (cancelled) return;
      if (next) {
        hardRedirect(next);
        return;
      }
      hardRedirect(resolveAppEntry(fresh, true));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <WebAuthLayout mode="login" title="Signing you in" subtitle="Finishing Google…">
      {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : <p className="text-sm text-[#6B7280]">…</p>}
    </WebAuthLayout>
  );
}
