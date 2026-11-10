"use client";

import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

import { isTijarNativeApp } from "@/lib/tijar-native-app";
import { cn } from "@/lib/utils";

export function nativeCanvasClass(...extra: (string | false | undefined)[]) {
  return cn(isTijarNativeApp() ? "bg-[var(--native-canvas,#F3F5F8)]" : "bg-white", extra);
}

export function nativeIconBtnClass() {
  return isTijarNativeApp()
    ? "flex size-10 items-center justify-center rounded-full bg-white text-foreground shadow-[0_4px_14px_rgba(11,31,58,0.08)]"
    : "flex size-10 items-center justify-center rounded-full";
}

/** Quiet shop-style page header used across native screens. */
export function NativePageHeader({
  title,
  subtitle,
  showBack = false,
  actions,
}: {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  actions?: ReactNode;
}) {
  const nativeApp = isTijarNativeApp();

  return (
    <header
      className={cn(
        "shrink-0 px-4 pb-3 pt-[max(0.65rem,env(safe-area-inset-top))]",
        nativeApp ? "border-0 bg-transparent" : "border-b border-border bg-white",
      )}
    >
      <div className="flex items-center gap-2">
        {showBack ? (
          <button
            type="button"
            onClick={() => window.history.back()}
            className={nativeIconBtnClass()}
            aria-label="Back"
          >
            <ArrowLeft className="size-5" />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[22px] font-extrabold tracking-tight text-[color:var(--brand-navy,#0B1F3A)]">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-0.5 truncate text-[12px] font-medium text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {actions}
      </div>
    </header>
  );
}
