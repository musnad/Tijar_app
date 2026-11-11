"use client";

import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { useAuth } from "@/features/auth/auth-context";
import { isRecoveryCallback, parseAuthCallbackParams } from "@/lib/auth/recovery-params";
import { isPasswordRecovery, markPasswordRecovery } from "@/lib/auth-recovery";
import { SupabaseSetupNotice } from "@/features/auth/supabase-setup-notice";
import { hardRedirect, resolveAppEntry } from "@/features/auth/route-guards";
import { canUseBusinessMode, isCustomerOnly } from "@/lib/account-mode";
import { isTijarSuperAdminEmail } from "@/lib/admin";

export function RequireAuth({
  children,
  requireOnboardingComplete = true,
}: {
  children: ReactNode;
  requireOnboardingComplete?: boolean;
}) {
  const { loading, session, profile, configured, configLoading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (loading) return;
    if (!configured) return;

    const authed = Boolean(session);
    if (!authed) {
      void navigate({ to: "/login" });
      return;
    }

    const editingShop =
      pathname.startsWith("/app/business") || pathname.startsWith("/shop/payouts");

    // Customers never land on the business dashboard — apply from profile first.
    // Super-admin always keeps dashboard + admin console access.
    // Shop owners still need /app/business to edit even if account_mode is customer.
    if (
      profile &&
      isCustomerOnly(profile) &&
      !canUseBusinessMode(profile) &&
      !editingShop &&
      !isTijarSuperAdminEmail(profile.email) &&
      !isTijarSuperAdminEmail(session?.user.email) &&
      pathname.startsWith("/app") &&
      !pathname.startsWith("/app/login") &&
      !pathname.startsWith("/app/register")
    ) {
      void navigate({ to: "/shop/business-apply" });
      return;
    }

    const superAdmin =
      isTijarSuperAdminEmail(profile?.email) || isTijarSuperAdminEmail(session?.user.email);

    if (
      requireOnboardingComplete &&
      profile?.onboarding_status !== "completed" &&
      !superAdmin
    ) {
      void navigate({ to: "/app/onboarding" });
    }
  }, [loading, session, profile, configured, requireOnboardingComplete, navigate, pathname]);

  if (configLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">…</div>
    );
  }

  if (!configured) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4 py-10">
        <SupabaseSetupNotice />
      </div>
    );
  }

  if (loading || !session) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
        …
      </div>
    );
  }

  if (
    requireOnboardingComplete &&
    profile?.onboarding_status !== "completed" &&
    !isTijarSuperAdminEmail(profile?.email) &&
    !isTijarSuperAdminEmail(session.user.email)
  ) {
    return null;
  }

  return children;
}

export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { loading, session, profile } = useAuth();
  const userId = session?.user.id;

  useEffect(() => {
    if (loading || !userId) return;
    if (typeof window !== "undefined") {
      const params = parseAuthCallbackParams(window.location.href);
      if (isRecoveryCallback(params, window.location.pathname)) {
        markPasswordRecovery();
        if (window.location.pathname !== "/reset-password") {
          hardRedirect("/reset-password");
          return;
        }
      }
    }
    if (isPasswordRecovery()) {
      hardRedirect("/reset-password");
      return;
    }
    if (profile) {
      hardRedirect(resolveAppEntry(profile, true));
      return;
    }
    const timer = window.setTimeout(() => {
      hardRedirect("/shop");
    }, 800);
    return () => window.clearTimeout(timer);
  }, [loading, userId, profile]);

  if (loading || session) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4 text-center text-sm text-muted-foreground">
        Opening TIJAR…
      </div>
    );
  }

  return children;
}
