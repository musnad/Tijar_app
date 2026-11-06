"use client";

import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Mic, Package, ShoppingBag, User } from "lucide-react";
import type { ReactNode } from "react";

import { AppFab, AppLinkFab } from "@/features/app-layout/app-fab";
import { AppTopBar } from "@/features/app-layout/app-top-bar";
import { useTranslation } from "@/lib/i18n/context";
import { isTijarNativeApp } from "@/lib/tijar-native-app";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/app" as const, labelKey: "app.home.navHome", icon: Home, exact: true },
  {
    to: "/app/sales" as const,
    labelKey: "app.home.navSales",
    icon: ShoppingBag,
    matchPrefixes: ["/app/sales"],
  },
  { to: "/app/products" as const, labelKey: "app.home.navProducts", icon: Package },
  { to: "/app/assistant" as const, labelKey: "app.home.navAssistant", icon: Mic },
  { to: "/app/profile" as const, labelKey: "app.home.navProfile", icon: User },
] as const;

function isNavActive(pathname: string, item: (typeof navItems)[number]): boolean {
  if ("exact" in item && item.exact) {
    return pathname === "/app" || pathname === "/app/";
  }
  if ("matchPrefixes" in item && item.matchPrefixes) {
    return item.matchPrefixes.some((p) => pathname.startsWith(p));
  }
  return pathname.startsWith(item.to);
}

export function AppShell({
  children,
  fab,
}: {
  children: ReactNode;
  fab?: "sale" | "expense" | "credit" | "product";
}) {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const nativeApp = isTijarNativeApp();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main
        className={cn(
          "mx-auto w-full max-w-lg flex-1 px-4 pt-3 sm:px-5",
          !nativeApp && "lg:max-w-6xl xl:max-w-7xl",
          fab ? "pb-28" : "pb-4",
        )}
      >
        <AppTopBar />
        {children}
      </main>

      {fab === "sale" && (
        <AppFab recordType="sale" label={t("app.sales.newSale")} />
      )}
      {fab === "expense" && (
        <AppFab recordType="expense" label={t("app.expenses.newExpense")} />
      )}
      {fab === "credit" && (
        <AppLinkFab to="/app/customers/credit/new" label={t("app.customers.newCreditFab")} />
      )}
      {fab === "product" && (
        <AppLinkFab
          to="/app/products/new"
          label={t("app.products.newFab")}
          className="bg-teal-700 hover:bg-teal-800"
        />
      )}

      <nav className="app-bottom-nav sticky bottom-0 border-t border-border bg-background/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-sm">
        <div className={cn("mx-auto grid max-w-lg grid-cols-5 gap-0 px-2", !nativeApp && "lg:max-w-6xl xl:max-w-7xl")}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isNavActive(pathname, item);
            return (
              <Link
                key={item.labelKey}
                to={item.to}
                className={cn(
                  "app-tab flex min-h-[3.5rem] flex-col items-center justify-center gap-0.5 text-[10px] font-semibold",
                  active ? "app-tab-active text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className={cn("size-5", active && "stroke-[2.5]")} />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
