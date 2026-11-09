import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import { NotificationPopup } from "@/features/marketplace/notification-popup";
import { capacitorPlugin, hideNativeSplash } from "@/lib/capacitor-bridge";

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
    pathname.startsWith("/auth/")
  );
}

function isShopFeedPath(pathname: string): boolean {
  return pathname === "/shop" || pathname === "/shop/" || pathname.startsWith("/shop/") || pathname.startsWith("/b/");
}

/** Native WebView chrome: shop only, no marketing site. */
export function MobileApp() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const shopFeed = isShopFeedPath(pathname);

  useEffect(() => {
    document.documentElement.classList.add("tijar-android-webview");
    window.setTimeout(() => {
      void hideNativeSplash();
    }, 180);
    const status = capacitorPlugin<{
      setStyle: (opts: { style: string }) => Promise<void>;
      setBackgroundColor: (opts: { color: string }) => Promise<void>;
    }>("StatusBar");
    void status?.setStyle({ style: "LIGHT" }).catch(() => undefined);
    void status?.setBackgroundColor({ color: "#F4F7FB" }).catch(() => undefined);

    const app = capacitorPlugin<{
      addListener: (event: string, cb: (info: { canGoBack: boolean }) => void) => Promise<{ remove: () => Promise<void> }>;
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
    return () => remove?.();
  }, []);

  useEffect(() => {
    if (isAppChromePath(pathname)) return;
    void navigate({ to: "/shop" });
  }, [pathname, navigate]);

  return (
    <div className={shopFeed ? "h-dvh overflow-hidden bg-background text-foreground" : "min-h-screen bg-background text-foreground"}>
      <main id="main-content" className={shopFeed ? "h-full overflow-hidden" : undefined}>
        <Outlet />
      </main>
      <NotificationPopup />
    </div>
  );
}
