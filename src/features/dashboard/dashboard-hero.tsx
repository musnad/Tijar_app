"use client";

import { BadgeCheck, MapPin } from "lucide-react";

import { ShopSwitcher } from "@/features/business/shop-switcher";
import { useTranslation } from "@/lib/i18n/context";
import type { Business } from "@/types/database";

function timeGreetingKey(): "morning" | "afternoon" | "evening" {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

export function DashboardHero({
  firstName,
  business,
}: {
  firstName: string;
  business: Business;
}) {
  const { t } = useTranslation();
  const slot = timeGreetingKey();
  const verified = business.verification_status === "verified";

  return (
    <section className="relative mt-4 overflow-hidden rounded-2xl">
      <div className="relative z-10 pr-[42%]">
        <p className="text-sm font-semibold text-muted-foreground">
          {t(`app.dashboard.greeting.${slot}`)}, {firstName}
        </p>
        <h1 className="mt-0.5 text-[1.65rem] font-extrabold leading-tight text-foreground">
          {business.business_name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("app.dashboard.growthHint")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {verified && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
              <BadgeCheck className="size-3.5" />
              {t("app.dashboard.verified")}
            </span>
          )}
          {business.location && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <MapPin className="size-3.5 shrink-0 text-primary" />
              {business.location}
            </span>
          )}
          {business.parent_business_id ? (
            <span className="inline-flex items-center rounded-full bg-[#1F7A4D]/10 px-2.5 py-1 text-xs font-semibold text-[#1F7A4D]">
              Branch
            </span>
          ) : null}
        </div>
        <ShopSwitcher />
      </div>
      <div
        className="dashboard-hero-blob pointer-events-none absolute -right-6 top-0 z-0 flex h-[7.5rem] w-[11rem] items-center justify-center p-4 text-center text-[11px] font-semibold leading-snug text-primary"
        aria-hidden
      >
        {t("app.dashboard.heroTagline")}
      </div>
    </section>
  );
}
