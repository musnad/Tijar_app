import { canUseBusinessMode, isCustomerOnly, profileActiveMode } from "@/lib/account-mode";
import { absoluteAppUrl } from "@/lib/site-url";
import { fetchCurrentProfile } from "@/services/profile-service";
import type { Profile } from "@/types/database";

export function resolveAppEntry(profile: Profile | null, isAuthenticated: boolean) {
  if (!isAuthenticated) {
    return "/login" as const;
  }
  if (!profile) {
    return "/shop" as const;
  }

  // Customer-only accounts go straight to the marketplace.
  if (isCustomerOnly(profile) || profileActiveMode(profile) === "customer") {
    return "/shop" as const;
  }

  if (profile.onboarding_status !== "completed") {
    return "/app/onboarding" as const;
  }

  if (canUseBusinessMode(profile) && profileActiveMode(profile) === "business") {
    return "/app" as const;
  }

  return "/shop" as const;
}

/** Full navigation so WebView / stale SPA state cannot keep the login screen mounted. */
export function hardRedirect(path: string) {
  if (typeof window === "undefined") return;
  const target = path.startsWith("http") ? path : absoluteAppUrl(path);
  window.location.replace(target);
}

export function goAfterLogin(profile: Profile | null) {
  hardRedirect(resolveAppEntry(profile, true));
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(fallback), ms);
    void promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      () => {
        window.clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/** After a live session exists, leave auth screens immediately. */
export async function enterAppAfterAuth(options?: {
  prefer?: "shop" | "onboarding" | "app";
}): Promise<void> {
  if (typeof window !== "undefined") {
    const pending = window.sessionStorage.getItem("tijar-after-login");
    window.sessionStorage.removeItem("tijar-after-login");
    if (pending && pending.startsWith("/") && !pending.startsWith("//")) {
      hardRedirect(pending);
      return;
    }
  }
  if (options?.prefer === "onboarding") {
    hardRedirect("/app/onboarding");
    return;
  }
  if (options?.prefer === "shop") {
    hardRedirect("/shop");
    return;
  }
  if (options?.prefer === "app") {
    hardRedirect("/app");
    return;
  }
  const profile = await withTimeout(
    fetchCurrentProfile().then((r) => r.profile),
    1500,
    null,
  );
  goAfterLogin(profile);
}
