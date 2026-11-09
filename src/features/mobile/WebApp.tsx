import { Outlet, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/features/auth/auth-context";
import { SiteFooter, SiteHeader } from "@/components/site-shell";
import { NotificationPopup } from "@/features/marketplace/notification-popup";

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
  return (
    pathname === "/shop" ||
    pathname === "/shop/" ||
    pathname === "/shop/discover" ||
    pathname === "/shop/create" ||
    pathname === "/shop/business-apply" ||
    pathname === "/shop/enquiries" ||
    pathname.startsWith("/shop/enquiries/") ||
    pathname === "/shop/profile" ||
    pathname === "/shop/settings" ||
    pathname === "/shop/help" ||
    pathname === "/shop/edit-profile" ||
    pathname.startsWith("/shop/p/") ||
    pathname.startsWith("/b/") ||
    pathname === "/shop/buy" ||
    pathname === "/shop/orders" ||
    pathname.startsWith("/shop/orders/") ||
    pathname === "/shop/favorites" ||
    pathname === "/shop/follows" ||
    pathname === "/shop/followers" ||
    pathname === "/shop/cart" ||
    pathname === "/shop/checkout" ||
    pathname === "/shop/studio"
  );
}

/** Browser website: marketing chrome on public pages, shop/app chrome elsewhere. */
export function WebApp() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { session } = useAuth();
  const isLoggedInProductSurface =
    Boolean(session) &&
    (pathname.startsWith("/discover") || pathname.startsWith("/translate") || pathname.startsWith("/b/"));
  const showMarketingShell = !isAppChromePath(pathname) && !isLoggedInProductSurface;
  const shopFeed = isShopFeedPath(pathname);

  return (
    <div className={shopFeed ? "h-dvh overflow-hidden bg-background text-foreground" : "min-h-screen bg-background text-foreground"}>
      {showMarketingShell && <SiteHeader />}
      <main id="main-content" className={shopFeed ? "h-full overflow-hidden" : undefined}>
        <Outlet />
      </main>
      {showMarketingShell && <SiteFooter />}
      <NotificationPopup />
    </div>
  );
}
