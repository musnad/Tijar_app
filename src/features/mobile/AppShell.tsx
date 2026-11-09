import { Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import { SiteFooter, SiteHeader } from "@/components/site-shell";
import { NotificationPopup } from "@/features/marketplace/notification-popup";
import { useAuth } from "@/features/auth/auth-context";
import { capacitorPlugin, hideNativeSplash } from "@/lib/capacitor-bridge";
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
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!isNativeApp()) return;
    document.documentElement.classList.add("tijar-android-webview");
    const t = window.setTimeout(() => {
      void hideNativeSplash();
    }, 120);
    const status = capacitorPlugin<{
      setStyle: (opts: { style: string }) => Promise<void>;
      setBackgroundColor: (opts: { color: string }) => Promise<void>;
    }>("StatusBar");
    void status?.setStyle({ style: "LIGHT" }).catch(() => undefined);
    void status?.setBackgroundColor({ color: "#F4F7FB" }).catch(() => undefined);

    const app = capacitorPlugin<{
      addListener: (
        event: string,
        cb: (info: { canGoBack: boolean }) => void,
      ) => Promise<{ remove: () => Promise<void> }>;
      exitApp: () => Promise<void>;
    }>("App");
    let remove: (() => void) | undefined;
    void app
      ?.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack) window.history.back();
        else void app.exitApp();
      })
      .then((handle) => {
        remove = () => {
          void handle.remove();
        };
      })
      .catch(() => undefined);
    return () => {
      window.clearTimeout(t);
      remove?.();
    };
  }, []);

  useEffect(() => {
    if (!isNativeApp()) return;
    if (window.location.hostname === "localhost" || pathname === "/" || pathname === "" || pathname === "/index.html") {
      window.location.replace("https://www.tijar.ng/shop");
    }
  }, [pathname]);

  return null;
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
          ? "h-dvh overflow-hidden bg-background text-foreground"
          : "min-h-screen bg-background text-foreground"
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
