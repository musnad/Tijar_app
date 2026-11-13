import { Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { SiteFooter, SiteHeader } from "@/components/site-shell";
import { NotificationPopup } from "@/features/marketplace/notification-popup";
import { useAuth } from "@/features/auth/auth-context";
import { bootNativeAndroidRuntime } from "@/lib/native-android-runtime";
import { initNativePush } from "@/lib/native-push";
import { isNativeApp } from "@/utils/isMobile";

function isAppChromePath(pathname: string): boolean {
  return (
    pathname.startsWith("/app") ||
    pathname.startsWith("/shop") ||
    pathname.startsWith("/b/") ||
    pathname.startsWith("/learn") ||
    pathname.startsWith("/translate") ||
    pathname.startsWith("/discover") ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/privacy" ||
    pathname === "/terms" ||
    pathname.startsWith("/login/") ||
    pathname.startsWith("/register/") ||
    pathname.startsWith("/auth/")
  );
}

function isShopFeedPath(pathname: string): boolean {
  return pathname === "/shop" || pathname === "/shop/" || pathname.startsWith("/shop/") || pathname.startsWith("/b/");
}

function NativeRuntime() {
  const { session } = useAuth();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    return bootNativeAndroidRuntime();
  }, []);

  useEffect(() => {
    if (!isNativeApp()) return;
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  useEffect(() => {
    if (!isNativeApp() || !session) return;
    void initNativePush({ requestPermission: true });
  }, [session]);

  if (!offline) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[80] bg-[#0B1F4D] px-3 py-1.5 pt-[max(0.35rem,env(safe-area-inset-top))] text-center text-[11px] font-extrabold text-white">
      You are offline. TIJAR will catch up when the network returns.
    </div>
  );
}

/** One layout for website + Android. Outlet never remounts when native mode is detected. */
export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { session } = useAuth();
  const isLoggedInProductSurface =
    Boolean(session) &&
    (pathname.startsWith("/discover") || pathname.startsWith("/translate") || pathname.startsWith("/b/"));
  const showMarketingShell = !isNativeApp() && !isAppChromePath(pathname) && !isLoggedInProductSurface;
  const shopFeed = isShopFeedPath(pathname);

  return (
    <div
      className={
        shopFeed
          ? "h-dvh min-w-0 overflow-hidden bg-background text-foreground"
          : "min-h-screen min-w-0 overflow-x-clip bg-background text-foreground"
      }
    >
      <NativeRuntime />
      {showMarketingShell ? <SiteHeader /> : null}
      <main id="main-content" className={shopFeed ? "h-full overflow-hidden" : undefined}>
        <Outlet />
      </main>
      {showMarketingShell ? <SiteFooter /> : null}
      <NotificationPopup />
    </div>
  );
}
