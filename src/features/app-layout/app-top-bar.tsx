"use client";

import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, ChevronDown, Menu, Settings } from "lucide-react";

import { TijarLogo } from "@/components/brand-logo";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { AppLanguageButton } from "@/features/app-layout/app-language-button";
import { ShopAvatarSwitch } from "@/features/business/shop-avatar-switch";
import { AccountModeSwitch } from "@/features/marketplace/account-mode-switch";
import { useAuth } from "@/features/auth/auth-context";
import { isTijarSuperAdminEmail } from "@/lib/admin";
import { useTranslation } from "@/lib/i18n/context";
import { isTijarNativeApp } from "@/lib/tijar-native-app";
import { cn } from "@/lib/utils";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

const menuLinks = [
  { to: "/app/customers" as const, labelKey: "app.customers.title" },
  { to: "/app/business" as const, labelKey: "app.home.navBusiness" },
  { to: "/shop/branches" as const, label: "Branch shops" },
  { to: "/app/learn" as const, labelKey: "app.home.navLearn" },
  { to: "/app/transactions" as const, labelKey: "app.home.navTransactions" },
  { to: "/app/expenses" as const, labelKey: "app.record.expenseShort" },
] as const;

export function AppTopBar() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const name = profile?.full_name ?? "";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onProfileArea = pathname.startsWith("/app/profile");
  const nativeApp = isTijarNativeApp();
  const iconBtn = nativeApp
    ? "flex size-10 items-center justify-center rounded-full bg-white text-foreground shadow-[0_4px_14px_rgba(11,31,58,0.08)]"
    : "flex size-10 items-center justify-center rounded-full border border-border bg-card text-foreground";

  return (
    <header className="grid grid-cols-[auto_1fr_auto] items-center gap-2 pb-3">
      <Sheet>
        <SheetTrigger asChild>
          <button
            type="button"
            className={iconBtn}
            aria-label={t("app.layout.openMenu")}
          >
            <Menu className="size-5" />
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[min(100%,280px)]">
          <SheetHeader>
            <SheetTitle>{t("app.layout.menuTitle")}</SheetTitle>
          </SheetHeader>
          <nav className="mt-6 flex flex-col gap-1">
            {menuLinks.map((item) => (
              <Link
                key={item.to + ("label" in item ? item.label : item.labelKey)}
                to={item.to}
                className="rounded-lg px-3 py-3 text-sm font-semibold hover:bg-muted"
              >
                {"label" in item ? item.label : t(item.labelKey)}
              </Link>
            ))}
            {isTijarSuperAdminEmail(profile?.email) && (
              <Link
                to="/app/admin"
                className="rounded-lg px-3 py-3 text-sm font-semibold text-primary hover:bg-muted"
              >
                Admin console
              </Link>
            )}
          </nav>
        </SheetContent>
      </Sheet>

      <div className="flex justify-center px-1">
        <Link to="/app" className="block max-w-[150px]">
          <TijarLogo compact className="mx-auto max-w-[150px]" />
        </Link>
      </div>

      <div className="flex items-center justify-end gap-1.5">
        {nativeApp ? null : <AccountModeSwitch className="hidden md:inline-flex" />}
        {nativeApp ? null : <AppLanguageButton />}
        <Link
          to="/shop/notifications"
          className={cn("relative", iconBtn, "text-muted-foreground")}
          aria-label={t("app.layout.notifications")}
        >
          <Bell className="size-5" />
        </Link>
        {onProfileArea ? (
          <Link
            to="/app/profile/settings"
            className={cn(iconBtn, "text-muted-foreground")}
            aria-label={t("app.profile.settingsTitle")}
          >
            <Settings className="size-5" />
          </Link>
        ) : (
          <ShopAvatarSwitch
            className={cn(
              "flex items-center gap-0.5 rounded-full py-0.5 pl-0.5 pr-1",
              nativeApp ? "border-0 bg-white shadow-[0_4px_14px_rgba(11,31,58,0.08)]" : "border border-border bg-card",
            )}
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
              {initials(name)}
            </span>
            <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
          </ShopAvatarSwitch>
        )}
      </div>
    </header>
  );
}
