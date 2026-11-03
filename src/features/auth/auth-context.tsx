"use client";

import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { markPasswordRecovery } from "@/lib/auth-recovery";
import { ensureSupabasePublicEnv } from "@/lib/supabase/bootstrap-env";
import { getSupabaseBrowserClient, primeSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseEnvPresent } from "@/lib/supabase/runtime-env";
import { fetchCurrentProfile } from "@/services/profile-service";
import type { Profile } from "@/types/database";

type AuthContextValue = {
  configured: boolean;
  configLoading: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [configLoading, setConfigLoading] = useState(() => !isSupabaseEnvPresent());
  const [configured, setConfigured] = useState(() => isSupabaseEnvPresent());
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const env = await ensureSupabasePublicEnv();
      if (cancelled) return;
      if (env) {
        // Reuses the global singleton — never creates a second GoTrueClient.
        primeSupabaseBrowserClient(env);
        setConfigured(true);
      }
      setConfigLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!configured) {
      setProfile(null);
      return;
    }
    const { profile: next } = await fetchCurrentProfile();
    setProfile(next);
  }, [configured]);

  useEffect(() => {
    if (configLoading) return;

    if (!configured) {
      setLoading(false);
      setSession(null);
      return;
    }

    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    const failSafe = window.setTimeout(() => setLoading(false), 4000);

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
      })
      .catch(() => {
        setSession(null);
      })
      .finally(() => {
        window.clearTimeout(failSafe);
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") markPasswordRecovery();
      setSession((prev) => {
        if (prev?.access_token === nextSession?.access_token && prev?.user.id === nextSession?.user.id) {
          return prev;
        }
        return nextSession;
      });
      setLoading(false);
    });

    return () => {
      window.clearTimeout(failSafe);
      subscription.unsubscribe();
    };
  }, [configLoading, configured]);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    void refreshProfile();
  }, [session, refreshProfile]);

  useEffect(() => {
    if (!profile?.email) return;
    void import("@/lib/admin").then(({ isTijarSuperAdminEmail }) => {
      if (!isTijarSuperAdminEmail(profile.email)) return;
      const supabase = getSupabaseBrowserClient();
      void supabase.rpc("claim_tijar_super_admin");
    });
  }, [profile?.email]);

  // Keep local TTS prefs in sync so speakText uses the shopkeeper's voice.
  useEffect(() => {
    if (!profile) return;
    void import("@/lib/voice/personal-voice").then(({ writePersonalVoicePrefs }) => {
      writePersonalVoicePrefs({
        preferredTtsVoice: profile.preferred_tts_voice ?? null,
        customVoiceId: profile.custom_voice_id ?? null,
        voiceSamplePath: profile.voice_sample_path ?? null,
      });
    });
  }, [profile]);

  const value = useMemo(
    () => ({
      configured,
      configLoading,
      loading,
      session,
      user: session?.user ?? null,
      profile,
      refreshProfile,
    }),
    [configured, configLoading, loading, session, profile, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
