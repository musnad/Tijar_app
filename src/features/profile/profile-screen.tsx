"use client";

import { Link } from "@tanstack/react-router";
import {
  BadgeCheck,
  BarChart3,
  Bell,
  ClipboardList,
  Headphones,
  MapPin,
  Package,
  ShoppingCart,
  Sparkles,
  Store,
  Settings,
  TrendingUp,
  ChevronRight,
  LogOut,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth/auth-service";
import { AccountModeSwitch } from "@/features/marketplace/account-mode-switch";
import { ProfileAvatarField } from "@/features/profile/profile-avatar-field";
import { ProfileMenuRow } from "@/features/profile/profile-menu-row";
import { useAuth } from "@/features/auth/auth-context";
import { isTijarSuperAdminEmail } from "@/lib/admin";
import { canUseBusinessMode, profileAccountMode } from "@/lib/account-mode";
import { useTranslation } from "@/lib/i18n/context";
import { fetchProfileDashboard } from "@/services/profile-analytics-service";
import type { Business, Profile } from "@/types/database";
import { formatNgnCompact } from "@/utils/money";

function formatJoined(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(
      new Date(iso),
    );
  } catch {
    return iso.slice(0, 7);
  }
}

function ProfileStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Package;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1 px-1 py-3 text-center">
      <Icon className="size-4 text-primary" strokeWidth={2.25} />
      <p className="text-[10px] font-semibold text-muted-foreground">{label}</p>
      <p className="text-xs font-extrabold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

export function ProfileScreen({
  profile,
  business,
}: {
  profile: Profile;
  business: Business | null;
}) {
  const { t, locale } = useTranslation();
  const { profile: authProfile } = useAuth();
  const verified = business?.verification_status === "verified";
  const accountMode = profileAccountMode(profile);
  const isAdmin = isTijarSuperAdminEmail(profile.email) || isTijarSuperAdminEmail(authProfile?.email);
  const bio = profile.bio?.trim() || business?.description?.trim() || "";
  const location = business?.location?.trim() || "";

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["profile-dashboard", business?.id, profile.id],
    enabled: Boolean(business?.id),
    queryFn: async () => {
      const result = await fetchProfileDashboard(business!.id, profile.created_at, t);
      if (result.error) throw new Error(result.error);
      return result.data!;
    },
  });

  return (
    <div className="mt-1 space-y-4 pb-4">
      <Link
        to="/app/profile/edit"
        className="profile-hero-card flex items-center gap-3 rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.08] to-primary/[0.03] p-4 shadow-sm"
      >
        <ProfileAvatarField
          name={profile.full_name}
          avatarUrl={profile.avatar_url}
          editLabel={t("app.profile.changePhoto")}
        />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-base font-extrabold text-foreground">
            {business?.business_name || profile.full_name || t("app.profile.unnamed")}
            {verified && <BadgeCheck className="size-5 shrink-0 text-primary" aria-hidden />}
          </p>
          {business?.business_name ? (
            <p className="text-xs font-medium text-muted-foreground">
              {profile.full_name || t("app.profile.roleOwner")}
            </p>
          ) : (
            <p className="text-xs font-medium text-muted-foreground">{t("app.profile.roleOwner")}</p>
          )}
          {location && (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3.5 shrink-0 text-primary" />
              <span className="truncate">{location}</span>
            </p>
          )}
          {bio && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{bio}</p>}
        </div>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      </Link>

      <div className="profile-stats-strip grid grid-cols-4 divide-x divide-primary/10 overflow-hidden rounded-2xl border border-primary/10">
        <ProfileStat
          icon={Package}
          label={t("app.profile.statProducts")}
          value={statsLoading ? "…" : String(stats?.productCount ?? 0)}
        />
        <ProfileStat
          icon={ShoppingCart}
          label={t("app.profile.statSales")}
          value={statsLoading ? "…" : formatNgnCompact(stats?.totalSales ?? 0)}
        />
        <ProfileStat
          icon={BarChart3}
          label={t("app.profile.statRating")}
          value={statsLoading ? "…" : stats?.ratingDisplay ?? "—"}
        />
        <ProfileStat
          icon={Sparkles}
          label={t("app.profile.statJoined")}
          value={formatJoined(profile.created_at, locale)}
        />
      </div>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-extrabold">Account mode</p>
            <p className="text-xs capitalize text-muted-foreground">
              {accountMode === "both" ? "Shop + Business" : accountMode}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {canUseBusinessMode(profile)
                ? "Switch to Shop to buy on the marketplace, or Business for your dashboard."
                : "Customers request a business account first. Approved shops switch freely."}
            </p>
          </div>
          <AccountModeSwitch />
        </div>
        {canUseBusinessMode(profile) && (
          <Button variant="outline" className="mt-3 w-full justify-start rounded-xl" asChild>
            <Link to="/shop">
              <ShoppingCart className="mr-2 size-4" /> Open marketplace
            </Link>
          </Button>
        )}
      </section>

      {isAdmin && (
        <Link
          to="/app/admin"
          className="flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/[0.06] p-4"
        >
          <span className="flex size-11 items-center justify-center rounded-full bg-primary/15 text-primary">
            <BadgeCheck className="size-6" />
          </span>
          <span className="min-w-0 flex-1">
            <p className="text-sm font-extrabold">Admin console</p>
            <p className="text-xs text-muted-foreground">Approvals, listings, users, and orders</p>
          </span>
          <ChevronRight className="size-5 text-muted-foreground" />
        </Link>
      )}

      {business && (
        <div
          className={`flex items-center gap-3 rounded-2xl border p-4 ${
            verified
              ? "border-primary/25 bg-primary/[0.06]"
              : "border-primary/25 bg-accent"
          }`}
        >
          <span
            className={`flex size-11 shrink-0 items-center justify-center rounded-full ${
              verified ? "bg-primary/15 text-primary" : "bg-primary/10 text-primary"
            }`}
          >
            <BadgeCheck className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-foreground">
              {verified ? t("app.profile.verifiedTitle") : t("app.profile.unverifiedTitle")}
            </p>
            <p className="text-xs text-muted-foreground">
              {verified ? t("app.profile.verifiedBody") : t("app.profile.unverifiedBody")}
            </p>
          </div>
          <Button size="sm" className="shrink-0 rounded-full text-xs font-bold" asChild>
            <Link to="/app/business">{t("app.profile.viewDetails")}</Link>
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <ProfileMenuRow
          icon={ClipboardList}
          title={t("app.profile.menuOrders")}
          subtitle={t("app.profile.menuOrdersHint")}
          to="/app/sales"
        />
        <ProfileMenuRow
          icon={Package}
          title={t("app.profile.menuProducts")}
          subtitle={t("app.profile.menuProductsHint")}
          to="/app/products"
        />
        <ProfileMenuRow
          icon={Sparkles}
          title="AI Marketing Studio"
          subtitle="Draft captions and 3–10s scripts for your products"
          to="/app/studio"
        />
        <ProfileMenuRow
          icon={Store}
          title={t("app.profile.menuBusiness")}
          subtitle={t("app.profile.menuBusinessHint")}
          to="/app/business"
        />
        <ProfileMenuRow
          icon={Bell}
          title={t("app.profile.menuNotifications")}
          subtitle={t("app.profile.menuNotificationsHint")}
          onClick={() => toast.message(t("app.profile.notificationsSoon"))}
        />
        <ProfileMenuRow
          icon={Headphones}
          title={t("app.profile.menuHelp")}
          subtitle={t("app.profile.menuHelpHint")}
          to="/contact"
        />
        <ProfileMenuRow
          icon={Settings}
          title={t("app.profile.settingsTitle")}
          subtitle={t("app.profile.menuSettingsHint")}
          to="/app/profile/settings"
        />
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.1] to-background p-4">
        <div className="dashboard-hero-blob pointer-events-none absolute -right-8 -top-6 size-32 opacity-40" aria-hidden />
        <div className="relative flex gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <TrendingUp className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-foreground">{t("app.profile.growTitle")}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("app.profile.growBody")}</p>
            <Button size="sm" className="mt-3 rounded-full text-xs font-bold" asChild>
              <Link to="/app/learn">{t("app.profile.exploreTips")}</Link>
            </Button>
          </div>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        className="mt-2 min-h-12 w-full rounded-xl font-bold"
        onClick={() => void signOut().then(() => window.location.assign("/app/login"))}
      >
        <LogOut className="mr-2 size-4" />
        {t("app.common.signOut")}
      </Button>
    </div>
  );
}
