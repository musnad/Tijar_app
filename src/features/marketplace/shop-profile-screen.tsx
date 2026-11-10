"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  BadgeCheck,
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  Grid3x3,
  Heart,
  Languages,
  LayoutDashboard,
  LogOut,
  Mail,
  MapPin,
  Menu,
  Package,
  Pencil,
  Phone,
  Settings,
  Share2,
  Trash2,
  Sparkles,
  Store,
  UserRound,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { FeedImage } from "@/components/media/feed-image";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { useAuth } from "@/features/auth/auth-context";
import { useAccountGate } from "@/features/auth/account-gate";
import { signOut } from "@/features/auth/auth-service";
import { usePrimaryBusiness } from "@/hooks/use-primary-business";
import { canUseBusinessMode } from "@/lib/account-mode";
import { displayShopName, shopLinkSlug, shopUsername, usernameMatchesName } from "@/lib/shop-names";
import { haptic } from "@/lib/haptics";
import { invalidateBusinessQueries } from "@/lib/invalidate-business-queries";
import { useTranslation } from "@/lib/i18n/context";
import { isTijarNativeApp } from "@/lib/tijar-native-app";
import { nativeIconBtnClass } from "@/features/marketplace/native-page-header";
import { cn } from "@/lib/utils";
import {
  fetchFollowedBusinesses,
  fetchNotificationPreferences,
  listAddresses,
  saveNotificationPreferences,
} from "@/services/marketplace-service";
import { fetchProfilePosts, fetchProfileProducts } from "@/services/public-profile-service";
import { deactivateProduct } from "@/services/product-service";
import { deleteVideoPost } from "@/services/bid-service";
import { fetchActivityNotifications, fetchFollowersForMe, fetchPeopleIFollow } from "@/services/social-service";
import { resolveCoverSrc } from "@/services/video-feed-service";
import { formatNgn } from "@/utils/money";
import type { NotificationPreferences } from "@/types/database";

function joinedLabel(iso: string | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <MarketplaceShell hideTopBar variant="feed">
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-hidden",
          isTijarNativeApp() ? "bg-[var(--native-canvas,#F3F5F8)]" : "bg-white",
        )}
      >
        {children}
      </div>
    </MarketplaceShell>
  );
}

export function ShopProfileScreen() {
  const { t } = useTranslation();
  const { profile, session, loading, refreshProfile } = useAuth();
  const { requireAccount } = useAccountGate();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const shopQuery = usePrimaryBusiness(profile?.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tab, setTab] = useState<"posts" | "products">("posts");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (loading || session) return;
    requireAccount("profile");
  }, [loading, session, requireAccount]);

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
  const postsQuery = useQuery({
    queryKey: ["own-profile-posts", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: () => fetchProfilePosts(profile!.id),
  });
  const productsQuery = useQuery({
    queryKey: ["own-profile-products", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: () => fetchProfileProducts(profile!.id),
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
    const shop = shopQuery.data?.business;
    const slug = shop
      ? shopLinkSlug(shopUsername(shop.business_name, shop.public_slug), shop.id)
      : "";
    const url = profile?.id
      ? `${window.location.origin}/shop/u/${profile.id}`
      : slug
        ? `${window.location.origin}/b/${slug}`
        : `${window.location.origin}/shop/profile`;
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
  const shop = shopQuery.data?.business;
  const name = demo
    ? t("shop.profile.member")
    : shop
      ? displayShopName(shop.business_name, profile.full_name)
      : profile.full_name?.trim() || t("shop.profile.member");
  const username = demo ? t("shop.profile.guest") : shopUsername(name, shop?.public_slug);
  const showDisplayName = !usernameMatchesName(name, username);
  const verified = Boolean(shop?.verified_badge);
  const posts = postsQuery.data ?? [];
  const products = productsQuery.data ?? [];
  const followers = followersQuery.data?.length ?? 0;
  const following = (followsQuery.data?.length ?? 0) + (peopleFollowQuery.data?.length ?? 0);
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
  const shopSlug = shop ? shopLinkSlug(shop.public_slug, shop.id) : "";

  const menu: { to: string; label: string; icon: LucideIcon; badge?: number }[] = [
    ...(!demo && (canUseBusinessMode(profile) || shopQuery.data?.business)
      ? [
          { to: "/app", label: t("shop.profile.dashboard"), icon: LayoutDashboard },
          { to: "/app/business", label: "Business account", icon: Store },
          { to: "/app/ai", label: t("shop.profile.aiTools"), icon: Sparkles },
          { to: "/shop/studio", label: t("shop.profile.studio"), icon: Sparkles },
        ]
      : []),
    ...(!demo && canUseBusinessMode(profile) && shopQuery.data?.business
      ? [
          { to: "/shop/payouts", label: "Wallet & payouts", icon: Wallet },
          { to: "/shop/create-order", label: "Place your order posts", icon: UtensilsCrossed },
        ]
      : []),
    { to: "/shop/order-now", label: "Place your order", icon: UtensilsCrossed },
    ...(!demo ? [{ to: "/shop/agent", label: "Set up a business (agent)", icon: Store }] : []),
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

  function patchPrefs(next: NotificationPreferences) {
    savePrefs.mutate(next);
  }

  function markEditFromProfile() {
    if (typeof window !== "undefined") sessionStorage.setItem("tijar-edit-return", "profile");
  }

  async function refreshCatalogue() {
    if (shop?.id) await invalidateBusinessQueries(queryClient, shop.id);
    await queryClient.invalidateQueries({ queryKey: ["own-profile-posts"] });
    await queryClient.invalidateQueries({ queryKey: ["own-profile-products"] });
  }

  async function removePost(postId: string) {
    if (!window.confirm("Delete this post? It will leave your profile and the feed.")) return;
    setBusyId(postId);
    const r = await deleteVideoPost(postId);
    setBusyId(null);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    haptic("success");
    toast.success("Post deleted.");
    await refreshCatalogue();
  }

  async function removeProduct(productId: string) {
    if (!window.confirm("Delete this product? It will leave your profile and your business catalogue.")) return;
    setBusyId(productId);
    const r = await deactivateProduct(productId);
    setBusyId(null);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    haptic("success");
    toast.success("Product deleted.");
    await refreshCatalogue();
  }

  return (
    <Frame>
      <header className="sticky top-0 z-20 shrink-0 border-b border-border/70 bg-white/95 px-4 pb-2 pt-[max(0.6rem,env(safe-area-inset-top))] backdrop-blur-md in-[.native-shop]:border-0 in-[.native-shop]:bg-transparent">
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
            className={cn(
              "flex size-10 items-center justify-center rounded-full text-[color:var(--brand-navy,#001B3A)] transition active:bg-muted",
              isTijarNativeApp() && nativeIconBtnClass(),
            )}
          >
            <Share2 className="size-5" strokeWidth={1.9} />
          </button>
          <button
            type="button"
            onClick={() => {
              haptic();
              setMenuOpen(true);
            }}
            aria-label={t("shop.profile.menu")}
            className={cn(
              "relative flex size-10 items-center justify-center rounded-full text-[color:var(--brand-navy,#001B3A)] transition active:bg-muted",
              isTijarNativeApp() && nativeIconBtnClass(),
            )}
          >
            <Menu className="size-6" strokeWidth={1.9} />
            {notifBadge > 0 ? (
              <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-extrabold text-white">
                {notifBadge > 9 ? "9+" : notifBadge}
              </span>
            ) : null}
          </button>
        </div>
      </header>

      <div
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <section className="flex items-center gap-5 px-5 pt-4" aria-label={t("shop.nav.profile")}>
          {photo ? (
            <FeedImage
              src={photo}
              alt=""
              eager
              width={168}
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
            <Stat
              value={posts.length}
              label={t("shop.profile.posts")}
              onClick={() => setTab("posts")}
            />
            <Stat value={followers} label={t("shop.profile.followers")} to="/shop/followers" />
            <Stat value={following} label={t("shop.profile.following")} to="/shop/follows" />
          </div>
        </section>

        <section className="px-5 pt-3.5">
          {showDisplayName ? (
            <p className="text-[15px] font-extrabold leading-tight text-[color:var(--brand-navy,#001B3A)]">{name}</p>
          ) : null}
          <p className={showDisplayName ? "mt-1 text-[13px] leading-snug text-foreground" : "text-[13px] leading-snug text-foreground"}>
            {bio}
          </p>
          <ul className="mt-2 space-y-1 text-[12.5px] font-medium text-muted-foreground">
            {location ? (
              <li className="flex items-center gap-1.5">
                <MapPin className="size-3.5 shrink-0 text-primary" aria-hidden />
                <span className="truncate">{location}</span>
              </li>
            ) : null}
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
              <Button asChild className="min-h-10 flex-1 rounded-full font-extrabold">
                <Link to="/login">{t("shop.signIn")}</Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-10 rounded-full border-border px-3 font-extrabold"
                onClick={() => void shareProfile()}
                aria-label={t("shop.profile.shareProfile")}
              >
                <Share2 className="size-4" />
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="outline" className="min-h-10 flex-1 rounded-full border-border font-extrabold bg-white">
                <Link to="/shop/edit-profile">
                  <Pencil className="mr-1.5 size-4" />
                  {t("shop.profile.edit")}
                </Link>
              </Button>
              {shopSlug ? (
                <Button asChild variant="outline" className="min-h-10 rounded-full border-border font-extrabold bg-white">
                  <Link to="/b/$slug" params={{ slug: shopSlug }}>
                    <Store className="mr-1.5 size-4" />
                    Shop
                  </Link>
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="min-h-10 flex-1 rounded-full border-border font-extrabold bg-white"
                onClick={() => void shareProfile()}
              >
                <Share2 className="mr-1.5 size-4" />
                {t("shop.profile.shareProfile")}
              </Button>
            </>
          )}
        </section>

        <nav className="mx-4 mt-4 grid grid-cols-2 rounded-full bg-white p-1 shadow-[0_4px_14px_rgba(11,31,58,0.06)] in-[.native-shop]:border-0">
          {(
            [
              { id: "posts" as const, label: t("shop.profile.posts"), icon: Grid3x3, count: posts.length },
              { id: "products" as const, label: t("shop.profile.products"), icon: Package, count: products.length },
            ]
          ).map((item) => {
            const active = tab === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  "relative flex min-h-11 items-center justify-center gap-1.5 text-[13px]",
                  "rounded-full",
                  active
                    ? "font-extrabold text-[color:var(--brand-navy,#001B3A)] bg-white shadow-[0_4px_12px_rgba(11,31,58,0.08)]"
                    : "font-semibold text-muted-foreground",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {tab === "posts" ? (
          posts.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">{t("shop.profile.emptyPosts")}</p>
          ) : (
            <ul className="grid grid-cols-3 gap-2 px-4 pt-3 md:grid-cols-4 lg:grid-cols-5">
              {posts.map((post) => {
                const cover = post.image_urls?.[0] || resolveCoverSrc(post.cover_path) || post.business_logo_url;
                return (
                  <li key={post.id} className="relative overflow-hidden rounded-2xl bg-white shadow-[0_8px_22px_rgba(11,31,58,0.08)]">
                    <Link to="/shop" search={{ v: post.id }} className="block aspect-square bg-muted">
                      {cover ? (
                        <FeedImage src={cover} alt="" width={360} />
                      ) : (
                        <span className="flex size-full items-center justify-center text-[10px] font-bold text-muted-foreground">
                          {t("shop.profile.posts")}
                        </span>
                      )}
                    </Link>
                    {!demo ? (
                      <OwnerActions
                        busy={busyId === post.id}
                        editTo="/shop/post/$postId/edit"
                        editParams={{ postId: post.id }}
                        onEdit={markEditFromProfile}
                        onDelete={() => void removePost(post.id)}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )
        ) : products.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">{t("shop.profile.emptyProducts")}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2.5 px-4 py-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((product) => (
              <li key={product.id} className="relative overflow-hidden rounded-xl border border-border bg-card">
                <Link to="/shop/p/$productId" params={{ productId: product.id }} className="block">
                  <span className="block aspect-[4/3] bg-muted">
                    {product.image_url ? (
                      <FeedImage src={product.image_url} alt="" width={360} />
                    ) : (
                      <span className="flex size-full items-center justify-center text-[10px] font-bold text-muted-foreground">
                        {t("shop.profile.products")}
                      </span>
                    )}
                  </span>
                  <span className="block p-2">
                    <span className="line-clamp-2 text-[13px] font-bold leading-snug">{product.name}</span>
                    <span className="mt-1 block text-[14px] font-extrabold text-primary">
                      {product.sale_price != null ? formatNgn(Number(product.sale_price)) : "Ask seller"}
                    </span>
                  </span>
                </Link>
                {!demo ? (
                  <OwnerActions
                    busy={busyId === product.id}
                    editTo="/app/products/$productId"
                    editParams={{ productId: product.id }}
                    onEdit={markEditFromProfile}
                    onDelete={() => void removeProduct(product.id)}
                    className="right-1.5 top-1.5"
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="right"
          className="flex h-full w-[86%] max-w-sm flex-col gap-0 overflow-hidden p-0"
        >
          <SheetHeader className="shrink-0 border-b border-border px-4 pb-3 pt-5 text-left">
            <SheetTitle className="text-[17px] font-extrabold">{t("shop.profile.menu")}</SheetTitle>
          </SheetHeader>
          <div
            className="min-h-0 flex-1 overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))]"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {!demo && prefs ? (
              <section className="border-b border-border px-4 py-4">
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
                      patchPrefs(
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
                <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">{t("shop.profile.notifHint")}</p>
                <ul className="mt-3 space-y-2.5">
                  <NotifRow
                    label={t("shop.settings.likes")}
                    checked={prefs.likes}
                    disabled={savePrefs.isPending}
                    onChange={(likes) => patchPrefs({ ...prefs, general: likes || prefs.comments || prefs.order_updates, likes })}
                  />
                  <NotifRow
                    label={t("shop.settings.comments")}
                    checked={prefs.comments}
                    disabled={savePrefs.isPending}
                    onChange={(comments) =>
                      patchPrefs({ ...prefs, general: comments || prefs.likes || prefs.order_updates, comments })
                    }
                  />
                  <NotifRow
                    label={t("shop.settings.purchasesOrders")}
                    checked={prefs.order_updates}
                    disabled={savePrefs.isPending}
                    onChange={(order_updates) => patchPrefs({ ...prefs, general: order_updates || prefs.likes, order_updates })}
                  />
                  <NotifRow
                    label={t("shop.settings.shopReplies")}
                    checked={prefs.enquiry_replies}
                    disabled={savePrefs.isPending}
                    onChange={(enquiry_replies) => patchPrefs({ ...prefs, enquiry_replies })}
                  />
                  <NotifRow
                    label={t("shop.settings.shopsIFollow")}
                    checked={prefs.followed_shops}
                    disabled={savePrefs.isPending}
                    onChange={(followed_shops) => patchPrefs({ ...prefs, followed_shops })}
                  />
                  <NotifRow
                    label={t("shop.settings.tips")}
                    checked={prefs.marketing}
                    disabled={savePrefs.isPending}
                    onChange={(marketing) => patchPrefs({ ...prefs, marketing })}
                  />
                </ul>
                <Link
                  to="/shop/settings"
                  onClick={() => {
                    haptic();
                    setMenuOpen(false);
                  }}
                  className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-extrabold text-primary"
                >
                  {t("shop.profile.manageNotifs")}
                  <ChevronRight className="size-3.5" />
                </Link>
              </section>
            ) : null}

            <nav aria-label={t("shop.profile.account")}>
              <ul>
                {menu.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to as "/shop/orders"}
                        onClick={() => {
                          haptic();
                          setMenuOpen(false);
                        }}
                        className="flex min-h-[3.15rem] items-center gap-3 px-4 text-[15px] font-semibold text-[color:var(--brand-navy,#001B3A)] transition active:bg-muted/70"
                      >
                        <Icon className="size-5 shrink-0" strokeWidth={1.75} />
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

            {!demo ? (
              <button
                type="button"
                className="mt-2 flex min-h-[3.15rem] w-full items-center gap-3 px-4 text-[15px] font-semibold text-[#b42318] transition active:bg-muted/70"
                onClick={async () => {
                  setMenuOpen(false);
                  await signOut();
                  await refreshProfile();
                  void navigate({ to: "/shop" });
                }}
              >
                <LogOut className="size-5" strokeWidth={1.75} />
                {t("shop.settings.logOut")}
              </button>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </Frame>
  );
}

function OwnerActions({
  busy,
  editTo,
  editParams,
  onEdit,
  onDelete,
  className,
}: {
  busy: boolean;
  editTo: "/shop/post/$postId/edit" | "/app/products/$productId";
  editParams: { postId: string } | { productId: string };
  onEdit: () => void;
  onDelete: () => void;
  className?: string;
}) {
  return (
    <div className={cn("absolute right-1 top-1 z-[2] flex gap-1", className)}>
      <Link
        to={editTo}
        params={editParams as never}
        onClick={onEdit}
        aria-label="Edit"
        className="flex size-8 items-center justify-center rounded-full bg-black/60 text-white shadow-sm"
      >
        <Pencil className="size-3.5" />
      </Link>
      <button
        type="button"
        disabled={busy}
        aria-label="Delete"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDelete();
        }}
        className="flex size-8 items-center justify-center rounded-full bg-black/60 text-white shadow-sm disabled:opacity-50"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

function NotifRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex min-h-9 items-center justify-between gap-3 text-[13px] font-medium text-[color:var(--brand-navy,#001B3A)]">
      {label}
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </label>
  );
}

function Stat({
  value,
  label,
  to,
  onClick,
}: {
  value: number;
  label: string;
  to?: string;
  onClick?: () => void;
}) {
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
  if (onClick) {
    return (
      <button type="button" className="text-center" aria-label={`${value} ${label}`} onClick={onClick}>
        {inner}
      </button>
    );
  }
  return (
    <div className="text-center" aria-label={`${value} ${label}`}>
      {inner}
    </div>
  );
}
