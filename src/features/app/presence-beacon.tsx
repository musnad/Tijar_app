"use client";

import { useEffect } from "react";

import { useAuth } from "@/features/auth/auth-context";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const VISITOR_KEY = "tijar-visitor-key";
const HEARTBEAT_MS = 60_000;

function visitorKey(): string {
  try {
    const existing = window.localStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
    const created = `v_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    window.localStorage.setItem(VISITOR_KEY, created);
    return created;
  } catch {
    return `v_anon_${Math.random().toString(36).slice(2)}`;
  }
}

/**
 * Feeds the admin console's "online now" and daily-visitor counters.
 * Mounted once at the root so every surface (shop feed, dashboard, storefront)
 * counts, and refreshes whenever the tab becomes visible again.
 */
export function PresenceBeacon() {
  const { session } = useAuth();
  const signedIn = Boolean(session);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;

    async function beat() {
      if (cancelled) return;
      try {
        await supabase.rpc("record_visit", { p_visitor_key: visitorKey() });
        if (signedIn) await supabase.rpc("touch_presence");
      } catch {
        // Presence is best-effort — never surface failures to the user.
      }
    }

    void beat();
    const id = window.setInterval(() => void beat(), HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void beat();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [signedIn]);

  return null;
}
