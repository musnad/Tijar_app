"use client";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  BadgeCheck,
  Bell,
  BookOpen,
  Building2,
  ChevronRight,
  CircleHelp,
  Heart,
  Languages,
  LayoutDashboard,
  MapPin,
  Package,
  Settings,
  Sparkles,
  Store,
  UserRound,
  UtensilsCrossed,
} from "lucide-react";
import { useEffect } from "react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { TijarLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { AppLanguageButton } from "@/features/app-layout/app-language-button";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { useAuth } from "@/features/auth/auth-context";
import { usePrimaryBusiness } from "@/hooks/use-primary-business";
import { canUseBusinessMode } from "@/lib/account-mode";
import { haptic } from "@/lib/haptics";
import { useTranslation } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import {
  countFavoriteProducts,
  fetchFollowedBusinesses,
  listAddresses,
} from "@/services/marketplace-service";
import { fetchActivityNotifications, fetchFollowersForMe, fetchPeopleIFollow } from "@/services/social-service";

function handleFromName(name: string, email: string | null): string {
  const fromEmail = email?.split("@")[0]?.replace(/[^a-zA-Z0-9]/g, "") ?? "";
  if (fromEmail) return fromEmail.toLowerCase();
  return name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "tijar";
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <MarketplaceShell hideTopBar variant="feed">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">{children}</div>
    </MarketplaceShell>
  );
}

export function ShopProfileScreen() {
  const { t } = useTranslation();
  const { profile, session, loading } = useAuth();
  const { requireAccount } = useAccountGate();
  const shopQuery = usePrimaryBusiness(profile?.id);

  useEffect(() => {
    if (loading || session) return;
    requireAccount("profile");
  }, [loading, session, requireAccount]);

  const favQuery = useQuery({
    queryKey: ["marketplace-fav-count", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => countFavoriteProducts(profile!.id),
  });
  const followsQuery = useQuery({
    queryKey: ["followed-shops", profile?.id ?? "guest"],
    queryFn: async () => {
      try {
        const r = await fetchFollowedBusinesses(profile?.id ?? "guest");
        return r.shops;
      } catch {
        return [];
      }
    },
  });
  const addressQuery = useQuery({
    queryKey: ["customer-addresses", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => (await listAddresses(profile!.id)).data,
  });
  const unreadQuery = useQuery({
    queryKey: ["activity-inbox", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      try {
        const r = await fetchActivityNotifications(profile!.id);
        return r.error ? { items: [], unread: 0 } : r;
      } catch {
        return { items: [], unread: 0 };
      }
    },
  });
  const followersQuery = useQuery({
    queryKey: ["shop-followers", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      try {
        return (await fetchFollowersForMe(profile!.id)).people;
      } catch {
        return [];
      }
    },
  });
  const peopleFollowQuery = useQuery({
    queryKey: ["followed-people", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      try {
        return (await fetchPeopleIFollow(profile!.id)).people;
      } catch {
        return [];
      }
    },
  });

  if (loading) {
    return (
      <Frame>
        <ProfileChrome />
        <p className="px-4 pt-8 text-center text-sm text-muted-foreground">{t("shop.profile.loading")}</p>
      </Frame>
    );
  }

  const demo = !session || !profile;
  const name = demo ? t("shop.profile.member") : profile.full_name?.trim() || t("shop.profile.member");
  const username = demo ? t("shop.profile.guest") : handleFromName(name, profile.email);
  const verified = !demo && canUseBusinessMode(profile);
  const followers = followersQuery.data?.length ?? 0;
  const following = (followsQuery.data?.length ?? 0) + (peopleFollowQuery.data?.length ?? 0);
  const saved = favQuery.data ?? 0;
  const bio = demo
    ? t("shop.profile.guestBio")
    : profile.bio?.trim() || t("shop.profile.defaultBio");
  const address = addressQuery.data?.find((a) => a.is_default) ?? addressQuery.data?.[0];
  const location = demo
    ? ""
    : [address?.city, address?.state].filter(Boolean).join(", ") || t("shop.profile.locationPrivate");
  const photo = demo ? null : profile.avatar_url;
  const notifBadge = unreadQuery.data?.unread ?? 0;

  const menu: { to: string; label: string; icon: LucideIcon; badge?: number }[] = [
    ...(!demo && (canUseBusinessMode(profile) || shopQuery.data?.business)
      ? [
          { to: "/app", label: t("shop.profile.dashboard"), icon: LayoutDashboard },
          { to: "/app/business", label: "Business account", icon: Store },
          { to: "/shop/studio", label: t("shop.profile.studio"), icon: Sparkles },
        ]
      : []),
    ...(!demo && canUseBusinessMode(profile) && shopQuery.data?.business
      ? [{ to: "/shop/create-order", label: "Place your order posts", icon: UtensilsCrossed }]
      : []),
    { to: "/shop/order-now", label: "Place your order", icon: UtensilsCrossed },
    { to: "/app/learn", label: t("shop.profile.learn"), icon: BookOpen },
    { to: "/translate", label: t("shop.profile.translate"), icon: Languages },
    { to: "/shop/orders", label: t("shop.profile.orders"), icon: Package },
    { to: "/shop/favorites", label: t("shop.profile.savedProducts"), icon: Heart },
    { to: "/shop/follows", label: t("shop.profile.following"), icon: Building2 },
    { to: "/shop/followers", label: t("shop.profile.followers"), icon: UserRound },
    { to: "/shop/notifications", label: t("shop.profile.notifications"), icon: Bell, badge: notifBadge },
    { to: "/shop/settings", label: t("shop.profile.settings"), icon: Settings },
    { to: "/shop/help", label: t("shop.profile.help"), icon: CircleHelp },
  ];

  return (
    <Frame>
      <ProfileChrome />
      <div
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <section className="flex items-start gap-3 px-4 pt-2" aria-label={t("shop.nav.profile")}>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt=""
              className="size-[4.75rem] shrink-0 rounded-full object-cover ring-2 ring-border"
            />
          ) : (
            <span
              className="flex size-[4.75rem] shrink-0 items-center justify-center rounded-full bg-muted text-xl font-extrabold text-[color:var(--brand-navy,#001B3A)]"
              aria-hidden
            >
              {name
                .split(/\s+/)
                .slice(0, 2)
                .map((p) => p[0])
                .join("")
                .toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1 pt-0.5">
            <h1 className="flex items-center gap-1.5 text-[22px] font-extrabold leading-tight tracking-tight text-[color:var(--brand-navy,#001B3A)]">
              <span className="truncate">{name}</span>
              {verified ? (
                <BadgeCheck className="size-5 shrink-0 fill-primary text-white" aria-label={t("shop.profile.verified")} />
              ) : null}
            </h1>
            <p className="text-[13px] font-medium text-muted-foreground">@{username}</p>
            <div className="mt-2.5 grid grid-cols-3 divide-x divide-border" role="group" aria-label={t("shop.nav.profile")}>
              <Stat value={followers} label={t("shop.profile.followers")} to="/shop/followers" />
              <Stat value={following} label={t("shop.profile.following")} to="/shop/follows" />
              <Stat value={saved} label={t("shop.profile.saved")} to="/shop/favorites" />
            </div>
          </div>
        </section>

        <section className="mx-4 mt-4 rounded-2xl border border-border bg-white p-3.5 shadow-[0_1px_2px_rgba(15,40,50,0.04)]">
          <p className="flex items-start gap-2 text-[13px] leading-snug text-foreground">
            <UserRound className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span>{bio}</span>
          </p>
          <p className="mt-2.5 flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
            <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
            {location}
          </p>
        </section>

        {demo ? (
          <Button className="mx-4 mt-4 min-h-12 w-[calc(100%-2rem)] rounded-full border-2 border-[color:var(--brand-navy,#001B3A)] bg-white font-extrabold text-[color:var(--brand-navy,#001B3A)] hover:bg-muted" asChild>
            <Link to="/login">{t("shop.signIn")}</Link>
          </Button>
        ) : (
          <Button
            variant="outline"
            className="mx-4 mt-4 min-h-12 w-[calc(100%-2rem)] rounded-full border-2 border-[color:var(--brand-navy,#001B3A)] font-extrabold text-[color:var(--brand-navy,#001B3A)]"
            asChild
          >
            <Link to="/shop/edit-profile">{t("shop.profile.edit")}</Link>
          </Button>
        )}

        <nav className="mt-4" aria-label={t("shop.profile.account")}>
          <ul>
            {menu.map((item, index) => {
              const Icon = item.icon;
              return (
                <li
                  key={item.to}
                  style={{ animation: `tijar-row-in 0.35s ease ${index * 45}ms both` }}
                >
                  <Link
                    to={item.to as "/shop/orders"}
                    onClick={() => haptic()}
                    className="flex min-h-[3.25rem] items-center gap-3 px-4 text-[15px] font-semibold text-[color:var(--brand-navy,#001B3A)] transition active:bg-muted/70"
                  >
                    <Icon className="size-5 shrink-0 text-[color:var(--brand-navy,#001B3A)]" strokeWidth={1.75} />
                    <span className="flex-1">{item.label}</span>
                    {item.badge && item.badge > 0 ? (
                      <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-extrabold text-white">
                        {item.badge > 9 ? "9+" : item.badge}
                      </span>
                    ) : null}
                    <ChevronRight className="size-5 text-muted-foreground/70" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </Frame>
  );
}

function ProfileChrome() {
  const { t } = useTranslation();
  return (
    <header className="relative shrink-0 px-6 pb-2 pt-[max(0.65rem,env(safe-area-inset-top))] text-center">
      <div className="absolute right-3 top-[max(0.65rem,env(safe-area-inset-top))]">
        <AppLanguageButton />
      </div>
      <Link to="/shop" className="inline-block max-w-[160px]" aria-label={t("shop.profile.home")}>
        <TijarLogo compact className="mx-auto max-w-[160px]" />
      </Link>
      <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
        {t("shop.profile.tagline")}
      </p>
    </header>
  );
}

function Stat({ value, label, to }: { value: number; label: string; to?: string }) {
  const inner = (
    <>
      <p className="text-[17px] font-extrabold tabular-nums leading-none text-[color:var(--brand-navy,#001B3A)]">{value}</p>
      <p className="mt-1 text-[11px] font-medium text-muted-foreground">{label}</p>
    </>
  );
  if (to) {
    return (
      <Link to={to} className="px-1 text-center" aria-label={`${value} ${label}`}>
        {inner}
      </Link>
    );
  }
  return (
    <div className="px-1 text-center" aria-label={`${value} ${label}`}>
      {inner}
    </div>
  );
}
