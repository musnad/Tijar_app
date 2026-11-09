"use client";

import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { Compass, Home, MessageCircle, PlusSquare, ShoppingBag, UserRound, Clapperboard } from "lucide-react";
import type { ReactNode } from "react";

import { TijarLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { AppLanguageButton } from "@/features/app-layout/app-language-button";
import { AccountModeSwitch } from "@/features/marketplace/account-mode-switch";
import { useAuth } from "@/features/auth/auth-context";
import { isTijarNativeApp } from "@/lib/tijar-native-app";
import { useTranslation } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { HOME_REFRESH_EVENT } from "@/lib/feed/feed-session";
import { countUnreadShopChats, fetchMyBusinessIds } from "@/services/shop-chat-service";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function MarketplaceTopBar({ leftSlot }: { leftSlot?: ReactNode }) {
  const { profile, session } = useAuth();
  const { t } = useTranslation();
  const name = profile?.full_name ?? "";

  return (
    <header className="grid grid-cols-[auto_1fr_auto] items-center gap-2 pb-3">
      {leftSlot ?? <div className="size-10" />}

      <div className="flex justify-center px-1">
        <Link to="/shop" className="block max-w-[140px]">
          <TijarLogo compact className="mx-auto max-w-[140px]" />
        </Link>
      </div>

      <div className="flex items-center justify-end gap-1.5">
        <AccountModeSwitch className="hidden min-[420px]:inline-flex" />
        <AppLanguageButton />
        {!session ? (
          <Button size="sm" className="h-9 rounded-full px-3 text-xs font-bold" asChild>
            <Link to="/register" search={{ intent: "customer" } as never}>
              {t("shop.signup")}
            </Link>
          </Button>
        ) : (
          <Link
            to="/shop/profile"
            className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-xs font-bold text-primary"
            aria-label={t("shop.nav.profile")}
          >
            {initials(name)}
          </Link>
        )}
      </div>
    </header>
  );
}

export function MarketplaceShell({
  children,
  cartCount = 0,
  hideTopBar = false,
  hideNav = false,
  mapLayout = false,
  leftSlot,
  variant = "page",
}: {
  children: ReactNode;
  cartCount?: number;
  hideTopBar?: boolean;
  hideNav?: boolean;
  mapLayout?: boolean;
  leftSlot?: ReactNode;
  variant?: "page" | "feed";
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { profile } = useAuth();
  const { t } = useTranslation();
  const nativeApp = isTijarNativeApp();
  const unreadQuery = useQuery({
    queryKey: ["shop-inbox-unread", profile?.id],
    enabled: Boolean(profile?.id),
    refetchInterval: 12_000,
    queryFn: async () => {
      try {
        const ids = await fetchMyBusinessIds(profile!.id);
        return await countUnreadShopChats(profile!.id, ids);
      } catch {
        return 0;
      }
    },
  });
  const unread = unreadQuery.data ?? 0;
  const feed = variant === "feed";
  const sellActive =
    pathname === "/shop/create" ||
    pathname.startsWith("/shop/create/") ||
    pathname === "/shop/create-order" ||
    pathname === "/shop/business-apply";

  const tabs = feed
    ? [
        { to: "/shop" as const, label: t("shop.nav.home"), icon: Home, exact: true },
        { to: "/shop/discover" as const, label: t("shop.nav.explore"), icon: Compass },
        { to: "/shop/create" as const, label: t("shop.nav.sell"), icon: PlusSquare, forceActive: sellActive },
        { to: "/shop/enquiries" as const, label: t("shop.nav.messages"), icon: MessageCircle, badge: unread },
        { to: "/shop/profile" as const, label: t("shop.nav.profile"), icon: UserRound },
      ]
    : [
        { to: "/shop" as const, label: t("shop.nav.forYou"), icon: Clapperboard, exact: true },
        { to: "/shop/discover" as const, label: t("shop.nav.discover"), icon: Compass },
        { to: "/shop/create" as const, label: t("shop.nav.sell"), icon: PlusSquare, forceActive: sellActive },
        { to: "/shop/browse" as const, label: t("shop.nav.shop"), icon: ShoppingBag, badge: cartCount },
        { to: "/shop/profile" as const, label: t("shop.nav.profile"), icon: UserRound },
      ];

  const pageScroll = !feed && !hideNav && !mapLayout;
  const canvasWidth = nativeApp
    ? "max-w-lg"
    : "max-w-lg md:max-w-3xl lg:max-w-6xl xl:max-w-7xl";

  return (
    <div
      className={cn(
        "flex h-full min-h-0 max-h-dvh w-full min-w-0 flex-col overflow-hidden",
        feed || hideNav ? "bg-white text-foreground" : "bg-background text-foreground",
      )}
    >
      <main
        className={cn(
          "mx-auto w-full min-h-0 min-w-0 flex-1",
          canvasWidth,
          feed || hideNav
            ? "flex flex-col p-0"
            : cn(
                "flex flex-col",
                mapLayout
                  ? "overflow-hidden px-2 pb-2"
                  : "overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y pt-[max(0.75rem,env(safe-area-inset-top))] px-4 pb-4 sm:px-5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
              ),
        )}
        style={pageScroll ? { WebkitOverflowScrolling: "touch" } : undefined}
      >
        {!hideTopBar && !feed && <MarketplaceTopBar leftSlot={leftSlot} />}
        {children}
      </main>

      {!hideNav && <nav
        className={cn(
          "z-40 shrink-0 border-t border-border pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]",
          feed
            ? "relative bg-white pb-[max(0.55rem,env(safe-area-inset-bottom))]"
            : "relative app-bottom-nav bg-background/95 backdrop-blur-sm",
        )}
        aria-label={t("shop.nav.shop")}
      >
        <div className={cn("mx-auto grid w-full grid-cols-5 gap-0 px-1", canvasWidth)}>
          {tabs.map((tab) => {
            const active =
              "forceActive" in tab && tab.forceActive
                ? true
                : "exact" in tab && tab.exact
                  ? pathname === "/shop" || pathname === "/shop/"
                  : pathname === tab.to || pathname.startsWith(`${tab.to}/`);
            const Icon = tab.icon;
            return (
              <Link
                key={`${tab.to}-${tab.label}`}
                to={tab.to}
                activeOptions={{ exact: Boolean("exact" in tab && tab.exact) }}
                onClick={(event) => {
                  if (!active || tab.to !== "/shop") return;
                  event.preventDefault();
                  window.dispatchEvent(new Event(HOME_REFRESH_EVENT));
                }}
                className={cn(
                  "relative flex min-h-11 min-w-11 touch-manipulation flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-semibold",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className={cn("size-5", active && "stroke-[2.5]", tab.to === "/shop/profile" && active && "fill-current")} />
                {tab.label}
                {"badge" in tab && tab.badge && tab.badge > 0 ? (
                  <span className="absolute right-[18%] top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
                    {tab.badge > 9 ? "9+" : tab.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </nav>}
    </div>
  );
}
