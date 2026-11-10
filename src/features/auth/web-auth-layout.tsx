"use client";

import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { TijarLogo } from "@/components/brand-logo";
import { useTranslation } from "@/lib/i18n/context";
import { isTijarNativeApp } from "@/lib/tijar-native-app";
import { cn } from "@/lib/utils";

export function WebAuthLayout({
  mode,
  title,
  subtitle,
  children,
  footer,
}: {
  mode: "login" | "register" | "forgot" | "reset";
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        "web-auth-root relative min-h-[100dvh] overflow-x-clip overflow-y-auto text-[#0B1F4D]",
        isTijarNativeApp() ? "native-shop bg-[var(--native-canvas,#F3F5F8)]" : "bg-[#F4F7FB]",
      )}
    >
      <div className="pointer-events-none absolute -left-24 top-[-6rem] size-[min(22rem,80vw)] rounded-full bg-[#1F7A4D]/12 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-[-4rem] size-[min(20rem,70vw)] rounded-full bg-[#0B1F4D]/10 blur-3xl" />
      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center px-4 py-8 sm:px-5 sm:py-10">
        <Link to="/" className="mx-auto mb-6 block w-[9.5rem]" aria-label="TIJAR home">
          <TijarLogo compact />
        </Link>
        <div className="rounded-[1.5rem] border border-white/80 bg-white/90 p-4 shadow-[0_18px_50px_rgba(11,31,77,0.08)] backdrop-blur-sm sm:rounded-[1.75rem] sm:p-8">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#1F7A4D]">
            {mode === "register" ? t("auth.signUp") : t("auth.webFormLabel")}
          </p>
          <h1 className="mt-2 text-[1.65rem] font-extrabold leading-tight tracking-tight">{title}</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-[#6B7280]">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
        {footer}
        <p className="mt-6 flex items-center justify-center gap-2 text-center text-[11px] text-[#9CA3AF]">
          <ShieldCheck className="size-3.5 text-[#1F7A4D]" />
          {t("auth.securityFooter")}
        </p>
      </div>
    </div>
  );
}
