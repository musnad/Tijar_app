"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  BadgeCheck,
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  Heart,
  Languages,
  LayoutDashboard,
  Mail,
  MapPin,
  Package,
  Pencil,
  Phone,
  Settings,
  Share2,
  Sparkles,
  Store,
  UserRound,
  UtensilsCrossed,
} from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { useAuth } from "@/features/auth/auth-context";
import { useAccountGate } from "@/features/auth/account-gate";
import { usePrimaryBusiness } from "@/hooks/use-primary-business";
import { canUseBusinessMode } from "@/lib/account-mode";
import { haptic } from "@/lib/haptics";
import { useTranslation } from "@/lib/i18n/context";
import {
  countFavoriteProducts,
  fetchFollowedBusinesses,
  fetchNotificationPreferences,
  listAddresses,
  saveNotificationPreferences,
} from "@/services/marketplace-service";
import { fetchActivityNotifications, fetchFollowersForMe, fetchPeopleIFollow } from "@/services/social-service";
import type { NotificationPreferences } from "@/types/database";

function handleFromName(name: string, email: string | null): string {
  const fromEmail = email?.split("@")[0]?.replace(/[^a-zA-Z0-9]/g, "") ?? "";
  if (fromEmail) return fromEmail.toLowerCase();
  return name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "tijar";
}

function joinedLabel(iso: string | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
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
  const queryClient = useQueryClient();
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
  const prefsQuery = useQuery({
    queryKey: ["notification-prefs", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => (await fetchNotificationPreferences(profile!.id)).prefs,
  });

  const savePrefs = useMutation({
    mutationFn: (prefs: NotificationPreferences) => saveNotificationPreferences(prefs),
    onSuccess: async () => {
      toast.success(t("shop.settings.saved"));
      await queryClient.invalidateQueries({ queryKey: ["notification-prefs"] });
      await queryClient.invalidateQueries({ queryKey: ["activity-popup"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  async function shareProfile() {
    const slug = shopQuery.data?.business?.public_slug;
    const url = slug ? `${window.location.origin}/b/${slug}` : `${window.location.origin}/shop/profile`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: profile?.full_name ?? "TIJAR profile", url });
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        toast.success(t("shop.profile.linkCopied"));
      }
    } catch {
      /* share cancelled */
    }
  }

  if (loading) {
    return (
      <Frame>
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
  const phone = demo ? null : profile.phone;
  const email = demo ? null : profile.email;
  const joined = demo ? "" : joinedLabel(profile.created_at);
  const prefs = prefsQuery.data;

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
      <header className="sticky top-0 z-20 shrink-0 border-b border-border/70 bg-white/95 px-4 pb-2 pt-[max(0.6rem,env(safe-area-inset-top))] backdrop-blur-md">
        <div className="flex items-center gap-1">
          <h1 className="flex min-w-0 flex-1 items-center gap-1.5 text-[17px] font-extrabold tracking-tight text-[color:var(--brand-navy,#001B3A)]">
            <span className="truncate">@{username}</span>
            {verified ? (
              <BadgeCheck className="size-4 shrink-0 fill-primary text-white" aria-label={t("shop.profile.verified")} />
            ) : null}
          </h1>
          <button
            type="button"
            onClick={() => void shareProfile()}
            aria-label={t("shop.profile.shareProfile")}
            className="flex size-10 items-center justify-center rounded-full text-[color:var(--brand-navy,#001B3A)] transition active:bg-muted"
          >
            <Share2 className="size-5" strokeWidth={1.9} />
          </button>
          <Link
            to="/shop/notifications"
            aria-label={t("shop.profile.notifications")}
            className="relative flex size-10 items-center justify-center rounded-full text-[color:var(--brand-navy,#001B3A)] transition active:bg-muted"
          >
            <Bell className="size-5" strokeWidth={1.9} />
            {notifBadge > 0 ? (
              <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-extrabold text-white">
                {notifBadge > 9 ? "9+" : notifBadge}
              </span>
            ) : null}
          </Link>
        </div>
      </header>

      <div
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <section className="flex items-center gap-5 px-5 pt-4" aria-label={t("shop.nav.profile")}>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt=""
              className="size-[5.25rem] shrink-0 rounded-full object-cover ring-2 ring-primary/25"
            />
          ) : (
            <span
              className="flex size-[5.25rem] shrink-0 items-center justify-center rounded-full bg-muted text-xl font-extrabold text-[color:var(--brand-navy,#001B3A)] ring-2 ring-primary/25"
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
          <div className="grid min-w-0 flex-1 grid-cols-3" role="group" aria-label={t("shop.nav.profile")}>
            <Stat value={saved} label={t("shop.profile.saved")} to="/shop/favorites" />
            <Stat value={followers} label={t("shop.profile.followers")} to="/shop/followers" />
            <Stat value={following} label={t("shop.profile.following")} to="/shop/follows" />
          </div>
        </section>

        <section className="px-5 pt-3.5">
          <p className="text-[15px] font-extrabold leading-tight text-[color:var(--brand-navy,#001B3A)]">{name}</p>
          <p className="mt-1 text-[13px] leading-snug text-foreground">{bio}</p>
          <ul className="mt-2 space-y-1 text-[12.5px] font-medium text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <MapPin className="size-3.5 shrink-0 text-primary" aria-hidden />
              <span className="truncate">{location}</span>
            </li>
            {phone ? (
              <li>
                <a href={`tel:${phone}`} className="flex items-center gap-1.5">
                  <Phone className="size-3.5 shrink-0 text-primary" aria-hidden />
                  <span className="truncate">{phone}</span>
                </a>
              </li>
            ) : null}
            {email ? (
              <li>
                <a href={`mailto:${email}`} className="flex items-center gap-1.5">
                  <Mail className="size-3.5 shrink-0 text-primary" aria-hidden />
                  <span className="truncate">{email}</span>
                </a>
              </li>
            ) : null}
            {joined ? (
              <li className="flex items-center gap-1.5">
                <CalendarDays className="size-3.5 shrink-0 text-primary" aria-hidden />
                <span>
                  {t("shop.profile.joined")} {joined}
                </span>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="mt-3.5 flex gap-2 px-5">
          {demo ? (
            <>
              <Button asChild className="min-h-10 flex-1 rounded-lg font-extrabold">
                <Link to="/login">{t("shop.signIn")}</Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-10 rounded-lg border-border px-3 font-extrabold"
                onClick={() => void shareProfile()}
                aria-label={t("shop.profile.shareProfile")}
              >
                <Share2 className="size-4" />
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="outline" className="min-h-10 flex-1 rounded-lg border-border font-extrabold">
                <Link to="/shop/edit-profile">
                  <Pencil className="mr-1.5 size-4" />
                  {t("shop.profile.edit")}
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-10 flex-1 rounded-lg border-border font-extrabold"
                onClick={() => void shareProfile()}
              >
                <Share2 className="mr-1.5 size-4" />
                {t("shop.profile.shareProfile")}
              </Button>
            </>
          )}
        </section>

        {!demo && prefs ? (
          <section className="mx-5 mt-4 rounded-2xl border border-border bg-white p-4 shadow-[0_1px_2px_rgba(15,40,50,0.04)]">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-[14px] font-extrabold text-[color:var(--brand-navy,#001B3A)]">
                <Bell className="size-4 text-primary" aria-hidden />
                {t("shop.profile.notifSettings")}
              </p>
              <Switch
                checked={prefs.general}
                disabled={savePrefs.isPending}
                aria-label={t("shop.settings.generalNotifs")}
                onCheckedChange={(general) =>
                  savePrefs.mutate(
                    general
                      ? {
                          ...prefs,
                          general: true,
                          likes: true,
                          comments: true,
                          order_updates: true,
                          enquiry_replies: true,
                          followed_shops: true,
                          marketing: true,
                        }
                      : { ...prefs, general: false },
                  )
                }
              />
            </div>
            <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">
              {t("shop.profile.notifHint")}
            </p>
            <Link
              to="/shop/settings"
              onClick={() => haptic()}
              className="mt-2.5 inline-flex items-center gap-1 text-[12.5px] font-extrabold text-primary"
            >
              {t("shop.profile.manageNotifs")}
              <ChevronRight className="size-3.5" />
            </Link>
          </section>
        ) : null}

        <nav className="mt-4" aria-label={t("shop.profile.account")}>
          <ul>
            {menu.map((item, index) => {
              const Icon = item.icon;
              return (
                <li key={item.to} style={{ animation: `tijar-row-in 0.35s ease ${index * 45}ms both` }}>
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

function Stat({ value, label, to }: { value: number; label: string; to?: string }) {
  const inner = (
    <>
      <p className="text-[17px] font-extrabold tabular-nums leading-none text-[color:var(--brand-navy,#001B3A)]">{value}</p>
      <p className="mt-1 text-[11px] font-medium text-muted-foreground">{label}</p>
    </>
  );
  if (to) {
    return (
      <Link to={to} className="text-center" aria-label={`${value} ${label}`}>
        {inner}
      </Link>
    );
  }
  return (
    <div className="text-center" aria-label={`${value} ${label}`}>
      {inner}
    </div>
  );
}
