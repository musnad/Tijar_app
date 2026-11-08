"use client";

import { Link } from "@tanstack/react-router";
import { BadgeCheck, MapPin, MoonStar, Pencil, Store, Target, Wallet, Workflow } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AppPageHeader } from "@/features/app-layout/app-page-header";
import { MiniStatCard } from "@/features/app-layout/mini-stat-card";
import { StatusBadge } from "@/features/app-layout/status-badge";
import { BankAccountCard } from "@/features/business/bank-account-card";
import { BusinessQuickActions } from "@/features/business/business-quick-actions";
import { KycSubmitCard } from "@/features/business/kyc-submit-card";
import { VerifiedBadgeCard } from "@/features/business/verified-badge-card";
import { translateDnaList, translateDnaSlug } from "@/features/business/translate-dna-label";
import { useTranslation } from "@/lib/i18n/context";
import type { Business, BusinessDna } from "@/types/database";

function DnaChipRow({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="border-b border-border px-4 py-3 last:border-b-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item}
            className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

export function BusinessScreen({
  business,
  dna,
  isLoading,
}: {
  business: Business | null;
  dna: BusinessDna | null;
  isLoading: boolean;
}) {
  const { t } = useTranslation();

  const verified = Boolean(business?.verified_badge);
  const revenueLabels = dna ? translateDnaList(t, dna.revenue_models) : [];
  const paymentLabels = dna ? translateDnaList(t, dna.payment_methods) : [];
  const goalLabels = dna ? translateDnaList(t, dna.goals) : [];
  const primaryModel =
    revenueLabels[0] ??
    (dna?.business_model ? translateDnaSlug(t, dna.business_model) : "—");

  return (
    <>
      <AppPageHeader
        title={t("app.business.title")}
        action={
          business ? (
            <Button variant="outline" size="sm" className="rounded-xl font-semibold" asChild>
              <Link to="/app/business/edit">
                <Pencil className="mr-1.5 size-4" />
                {t("app.business.edit")}
              </Link>
            </Button>
          ) : undefined
        }
      />

      {isLoading && <p className="mt-8 text-muted-foreground">…</p>}

      {business && (
        <>
          <div className="dashboard-summary-card mt-5 overflow-hidden rounded-2xl p-4 text-primary-foreground shadow-lg sm:p-5">
            <div className="flex items-start gap-3">
              {business.logo_url ? (
                <img
                  src={business.logo_url}
                  alt=""
                  className="size-14 shrink-0 rounded-xl object-cover ring-2 ring-white/25"
                />
              ) : (
                <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <Store className="size-7" strokeWidth={2} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white/85">{t("app.business.shopLabel")}</p>
                <p className="mt-0.5 text-xl font-extrabold leading-tight sm:text-2xl">
                  {business.business_name}
                </p>
                {business.description && (
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-white/75">
                    {business.description}
                  </p>
                )}
                {business.location && (
                  <p className="mt-2 flex items-center gap-1 text-xs text-white/80">
                    <MapPin className="size-3.5 shrink-0" />
                    <span className="truncate">{business.location}</span>
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {verified && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-bold">
                      <BadgeCheck className="size-3.5" />
                      {t("app.dashboard.verified")}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold">
                    <MoonStar className="size-3.5" />
                    {business.islamic_mode_enabled
                      ? t("app.home.islamicOn")
                      : t("app.home.islamicOff")}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <MiniStatCard
              label={t("app.business.model")}
              value={primaryModel}
              icon={Workflow}
              iconClassName="bg-teal-100 text-teal-800"
            />
            <MiniStatCard
              label={t("app.business.payments")}
              value={paymentLabels.length > 0 ? String(paymentLabels.length) : "—"}
              icon={Wallet}
              iconClassName="bg-primary/15 text-primary"
            />
            <MiniStatCard
              label={t("app.business.goals")}
              value={goalLabels.length > 0 ? String(goalLabels.length) : "—"}
              icon={Target}
              iconClassName="bg-primary/10 text-primary"
            />
          </div>

          <BusinessQuickActions />
          <BankAccountCard business={business} />
          <KycSubmitCard business={business} />
          <VerifiedBadgeCard business={business} />

          <Link
            to="/app/business/publish"
            className="mt-3 flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4"
          >
            <Store className="size-6 shrink-0 text-primary" />
            <span>
              <span className="block font-bold">Shop visibility on Discover</span>
              <span className="block text-sm text-muted-foreground">
                {business.is_published
                  ? `Published as /b/${business.public_slug ?? "…"} (${business.moderation_status})`
                  : "Publish your shop so customers near you can find and contact you."}
              </span>
            </span>
          </Link>

          <section className="mt-8">
            <h2 className="font-bold">{t("app.home.dnaTitle")}</h2>
            {!dna ? (
              <div className="mt-3 rounded-2xl border border-dashed border-border p-6 text-center">
                <p className="text-sm text-muted-foreground">{t("app.business.noDna")}</p>
              </div>
            ) : (
              <>
                <div className="mt-3 flex flex-wrap gap-2">
                  {dna.customer_credit_enabled && (
                    <StatusBadge variant="pending" label={t("app.business.badgeCustomerCredit")} />
                  )}
                  {dna.supplier_credit_enabled && (
                    <StatusBadge variant="pending" label={t("app.business.badgeSupplierCredit")} />
                  )}
                  {dna.inventory_required && (
                    <StatusBadge variant="completed" label={t("app.business.badgeStock")} />
                  )}
                  {dna.has_staff && (
                    <StatusBadge variant="completed" label={t("app.business.badgeStaff")} />
                  )}
                </div>
                <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                  <DnaChipRow label={t("app.business.model")} items={revenueLabels} />
                  <DnaChipRow label={t("app.business.payments")} items={paymentLabels} />
                  <DnaChipRow label={t("app.business.goals")} items={goalLabels} />
                </div>
              </>
            )}
          </section>
        </>
      )}

      {!isLoading && !business && (
        <p className="mt-8 text-sm text-destructive">{t("app.errors.noBusiness")}</p>
      )}
    </>
  );
}
