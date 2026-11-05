"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { BadgeCheck, Bell, Clock, Flag, Heart, MapPin, MessageCircle, Navigation, Phone, Play, Plus, Share2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/auth-context";
import { useAccountGate } from "@/features/auth/account-gate";
import { usePrimaryBusiness } from "@/hooks/use-primary-business";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { TranslateText } from "@/features/translate/translate-text";
import { VoiceTranslate } from "@/features/translate/voice-translate";
import { useTranslation } from "@/lib/i18n/context";
import { getMapsProvider } from "@/lib/maps/provider";
import { languageForLocale } from "@/lib/translation/languages";
import { cn } from "@/lib/utils";
import { useStartShopChat } from "@/features/marketplace/use-start-shop-chat";
import { reportListing } from "@/services/marketplace-service";
import { updateBusinessProfile } from "@/services/business-service";
import { updateProfile } from "@/services/profile-service";
import { fetchStorefront, recordBusinessShare, submitEnquiry } from "@/services/discover-service";
import { recordBusinessInsight } from "@/services/seller-ai-service";
import { fetchMyBusinessIds } from "@/services/shop-chat-service";
import { displayShopName } from "@/lib/shop-names";
import { isFollowingShop } from "@/lib/shop-social";
import {
  fetchMyFollowedBusinessIds,
  isImagePost,
  resolveCoverSrc,
  resolveVideoSrc,
  toggleFollowBusiness,
  type PublicFeedVideo,
} from "@/services/video-feed-service";
import type { PublicProduct } from "@/types/database";
import { formatNgn } from "@/utils/money";

const SAVED_SHOPS_KEY = "tijar-saved-shops";

type StoreTab = "posts" | "featured" | "about";

function readIdList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeIdList(key: string, ids: string[]) {
  localStorage.setItem(key, JSON.stringify(ids));
}

function compactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

function productBadge(p: PublicProduct): string | null {
  const badge = p.attributes?.badge?.trim();
  return badge || null;
}

function StoreProductCard({ product: p, canPost }: { product: PublicProduct; canPost?: boolean }) {
  const badge = productBadge(p) || p.category_name;
  return (
    <div>
      <Link
        to="/shop/p/$productId"
        params={{ productId: p.id }}
        className="block overflow-hidden rounded-2xl bg-white text-left shadow-[0_1px_0_rgba(11,31,77,0.04)]"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-[#F3F4F6]">
          {p.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.image_url} alt={p.name} className="size-full object-cover" />
          ) : null}
          {badge ? (
            <span
              className={cn(
                "absolute left-2 top-2 rounded-md px-2 py-0.5 text-[10px] font-extrabold text-white",
                badge.toLowerCase() === "new" ? "bg-[#1F7A4D]" : "bg-[#0B1F4D]",
              )}
            >
              {badge}
            </span>
          ) : p.kind === "service" ? (
            <span className="absolute left-2 top-2 rounded-md bg-[#0B1F4D] px-2 py-0.5 text-[10px] font-extrabold text-white">
              Service
            </span>
          ) : null}
        </div>
        <div className="px-1.5 pb-2 pt-2">
          <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-[#0B1F4D]">{p.name}</p>
          <p className="mt-0.5 text-[15px] font-extrabold text-[#1F7A4D]">
            {p.sale_price != null ? formatNgn(p.sale_price) : "On request"}
          </p>
        </div>
      </Link>
      {canPost ? (
        <Link
          to="/shop/create"
          search={{ camera: true, productId: p.id }}
          className="mt-1.5 flex min-h-9 items-center justify-center rounded-xl bg-[#1F7A4D] text-[12px] font-extrabold text-white"
        >
          Post this
        </Link>
      ) : null}
    </div>
  );
}

function ShopPostTile({ video, shopName }: { video: PublicFeedVideo; shopName: string }) {
  const cover = resolveCoverSrc(video.cover_path);
  const src = resolveVideoSrc(video);
  const image = isImagePost(video);
  const poster = cover || src;
  return (
    <Link
      to="/shop"
      search={{ v: video.id }}
      className="relative block aspect-[3/4] overflow-hidden bg-[#F3F4F6]"
      aria-label={`${image ? "Photo" : "Video"} from ${shopName}`}
    >
      {poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" className="size-full object-cover" />
      ) : (
        <span className="flex size-full items-center justify-center text-[#9CA3AF]">{shopName.slice(0, 1)}</span>
      )}
      {!image ? (
        <span className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-black/45 text-white">
          <Play className="size-3 fill-white" />
        </span>
      ) : null}
    </Link>
  );
}

export function StorefrontScreen({ slug }: { slug: string }) {
  const { t, locale } = useTranslation();
  const voiceLang = languageForLocale(locale) ?? "English";
  const { session, profile, refreshProfile } = useAuth();
  const { requireAccount } = useAccountGate();
  const primaryBusiness = usePrimaryBusiness(profile?.id);
  const navigate = useNavigate();
  const startChat = useStartShopChat();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [tab, setTab] = useState<StoreTab>("posts");
  const [pull, setPull] = useState(0);
  const [savedTick, setSavedTick] = useState(0);
  const [mockFollowTick, setMockFollowTick] = useState(0);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [phoneSaving, setPhoneSaving] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);

  const DAY_LABELS: [string, string][] = [
    ["mon", t("app.storefront.monday")],
    ["tue", t("app.storefront.tuesday")],
    ["wed", t("app.storefront.wednesday")],
    ["thu", t("app.storefront.thursday")],
    ["fri", t("app.storefront.friday")],
    ["sat", t("app.storefront.saturday")],
    ["sun", t("app.storefront.sunday")],
  ];

  const query = useQuery({
    queryKey: ["storefront", slug],
    queryFn: async () => {
      const r = await fetchStorefront(slug);
      if (r.error) throw new Error(r.error);
      return r;
    },
  });

  const follows = useQuery({
    queryKey: ["followed-ids", profile?.id ?? "guest"],
    queryFn: () => fetchMyFollowedBusinessIds(profile?.id ?? "guest"),
  });

  const myShops = useQuery({
    queryKey: ["my-business-ids", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: () => fetchMyBusinessIds(profile!.id),
  });

  const business = query.data?.business;
  const products = query.data?.products ?? [];
  const videos = query.data?.videos ?? [];
  const ownSlug = primaryBusiness.data?.business?.public_slug;
  const viewingOwnShop = Boolean(profile && ownSlug && ownSlug === slug);
  const isOwner = Boolean(
    viewingOwnShop ||
      (profile &&
        business &&
        (primaryBusiness.data?.business?.id === business.id || myShops.data?.includes(business.id))),
  );
  useEffect(() => {
    if (!business?.id || isOwner) return;
    void recordBusinessInsight(business.id, "profile_view");
  }, [business?.id, isOwner]);
  const following = Boolean(business && (follows.data?.has(business.id) || isFollowingShop(profile?.id ?? "guest", business.id)));
  const shopSaved = business ? readIdList(SAVED_SHOPS_KEY).includes(business.id) : false;
  void savedTick;
  void mockFollowTick;

  const collections = useMemo(() => {
    const map = new Map<string, PublicProduct[]>();
    for (const p of products) {
      const key = p.attributes?.collection?.trim() || p.category_name?.trim() || "Catalogue";
      const list = map.get(key) ?? [];
      list.push(p);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [products]);

  const featured = products;
  const followerCount = following ? 1 : 0;
  const productCount = products.length;
  const postCount = videos.length;
  const shopTitle = displayShopName(business?.business_name, videos[0]?.business_name ?? products[0]?.business_name);

  async function onEnquiry(e: React.FormEvent) {
    e.preventDefault();
    if (!business) return;
    if (!name.trim() || !message.trim()) {
      toast.error(t("app.storefront.enquiryValidation"));
      return;
    }
    setSending(true);
    const { error } = await submitEnquiry({
      businessId: business.id,
      customerName: name,
      customerPhone: phone,
      message,
      profileId: profile?.id,
    });
    setSending(false);
    if (error) toast.error(error);
    else {
      toast.success(t("app.storefront.enquirySuccess"));
      setMessage("");
    }
  }

  async function onFollow() {
    if (!business) return;
    const r = await toggleFollowBusiness(profile?.id ?? "guest", business.id, profile?.full_name);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    setMockFollowTick((n) => n + 1);
    toast.success(r.following ? "Following this shop" : "Unfollowed");
    await queryClient.invalidateQueries({ queryKey: ["followed-ids"] });
    await queryClient.invalidateQueries({ queryKey: ["followed-shops"] });
    await queryClient.invalidateQueries({ queryKey: ["shop-followers"] });
    await queryClient.invalidateQueries({ queryKey: ["video-follows"] });
    await queryClient.invalidateQueries({ queryKey: ["followed-people"] });
    await queryClient.invalidateQueries({ queryKey: ["activity-inbox"] });
  }

  function onSaveShop() {
    if (!business) return;
    const ids = readIdList(SAVED_SHOPS_KEY);
    const next = ids.includes(business.id) ? ids.filter((id) => id !== business.id) : [...ids, business.id];
    writeIdList(SAVED_SHOPS_KEY, next);
    setSavedTick((n) => n + 1);
    toast.success(next.includes(business.id) ? "Shop saved" : "Removed from saved");
  }

  function openPhoneDialog() {
    setPhoneDraft(business?.public_phone ?? profile?.phone ?? "");
    setPhoneOpen(true);
  }

  async function savePhone() {
    if (!profile) {
      toast.message("Sign in to add your number.");
      return;
    }
    const value = phoneDraft.trim();
    if (value.replace(/\D/g, "").length < 7) {
      toast.error("Enter a valid phone number.");
      return;
    }
    setPhoneSaving(true);
    await updateProfile(profile.id, { phone: value });
    if (business) {
      await updateBusinessProfile(
        business.id,
        {
          businessName: business.business_name,
          location: business.location ?? "",
          description: business.description ?? undefined,
          categoryId: business.category_id ?? undefined,
          islamicModeEnabled: Boolean(business.islamic_mode_enabled),
          publicPhone: value,
        },
        profile.id,
      );
    }
    setPhoneSaving(false);
    setPhoneOpen(false);
    toast.success("Phone number saved to your profile.");
    await refreshProfile();
    await queryClient.invalidateQueries({ queryKey: ["storefront", slug] });
    await queryClient.invalidateQueries({ queryKey: ["primary-business"] });
  }

  async function onShareShop() {
    if (!business) return;
    const url = `${window.location.origin}/b/${business.slug}`;
    let channel = "copy";
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        channel = "native";
        await navigator.share({
          title: business.business_name,
          text: business.description ?? business.business_name,
          url,
        });
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        toast.success("Shop link copied");
      } else {
        return;
      }
    } catch {
      return;
    }
    await recordBusinessShare(business.id, channel);
  }

  async function onReport() {
    if (!requireAccount("generic") || !profile || !business) {
      return;
    }
    setReporting(true);
    const r = await reportListing({ reporterId: profile.id, businessId: business.id, reason: "other" });
    setReporting(false);
    if (r.error) toast.error(r.error);
    else toast.success("Report sent to TIJAR. We do not show fake reviews.");
  }

  async function refresh() {
    await query.refetch();
    await follows.refetch();
  }

  function onTouchStart(e: React.TouchEvent) {
    if (scrollerRef.current && scrollerRef.current.scrollTop <= 0) startY.current = e.touches[0]?.clientY ?? 0;
    else startY.current = 0;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!startY.current || !scrollerRef.current || scrollerRef.current.scrollTop > 0) {
      setPull(0);
      return;
    }
    const dy = (e.touches[0]?.clientY ?? 0) - startY.current;
    setPull(Math.max(0, Math.min(72, dy * 0.45)));
  }

  function onTouchEnd() {
    if (pull > 48) void refresh();
    setPull(0);
    startY.current = 0;
  }

  const loading = query.isLoading && !query.data;

  return (
    <MarketplaceShell hideTopBar variant="feed">
      <div
        ref={scrollerRef}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain bg-white [-webkit-overflow-scrolling:touch]"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <header className="sticky top-0 z-20 border-b border-[#EEF1F5] bg-white/95 px-4 py-1.5 backdrop-blur-md">
          <div className="flex items-center gap-1">
            <p className="min-w-0 flex-1 truncate text-[17px] font-extrabold tracking-tight text-[#0B1F4D]">
              @{business?.slug ?? slug}
            </p>
            <button
              type="button"
              onClick={() => void onShareShop()}
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-[#0B1F4D] transition active:bg-[#F3F4F6]"
              aria-label="Share profile"
            >
              <Share2 className="size-5" strokeWidth={1.9} />
            </button>
            <Link
              to="/shop/notifications"
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-[#0B1F4D] transition active:bg-[#F3F4F6]"
              aria-label="Notifications"
            >
              <Bell className="size-5" strokeWidth={1.9} />
            </Link>
          </div>
        </header>

        {pull > 8 || (query.isFetching && Boolean(query.data)) ? (
          <p
            className="py-1 text-center text-[11px] font-semibold text-[#1F7A4D]"
            style={{ height: Math.max(pull, query.isFetching && query.data ? 28 : 0) }}
          >
            {query.isFetching && query.data ? "Refreshing…" : "Release to refresh"}
          </p>
        ) : null}

        {loading ? (
          <p className="px-4 py-16 text-center text-sm text-muted-foreground">{t("app.storefront.loading")}</p>
        ) : !business && isOwner ? (
          <div className="px-6 py-16 text-center">
            <h1 className="text-xl font-bold text-[#0B1F4D]">Your shopfront</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Post a 5–30 second video tagged to a catalogue product. It goes live on For You with Buy Now.
            </p>
            <div className="mt-5 grid grid-cols-1 gap-2">
              <Button className="min-h-11 rounded-xl bg-[#1F7A4D] font-extrabold text-white hover:bg-[#1F7A4D]/90" asChild>
                <Link to="/shop/create">Create Post</Link>
              </Button>
              <Button variant="outline" className="min-h-11 rounded-xl font-extrabold" asChild>
                <Link to="/shop/create" search={{ camera: true }}>
                  Open Camera
                </Link>
              </Button>
            </div>
          </div>
        ) : !business ? (
          <div className="px-6 py-16 text-center">
            <h1 className="text-xl font-bold text-[#0B1F4D]">{t("app.storefront.notFoundTitle")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("app.storefront.notFoundBody")}</p>
            <Button asChild className="mt-5 rounded-xl bg-[#0B1F4D]">
              <Link to="/shop/discover">{t("app.storefront.browseShops")}</Link>
            </Button>
          </div>
        ) : (
          <>
            <section className="flex items-center gap-5 px-4 pb-3 pt-4">
              {business.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={business.logo_url}
                  alt=""
                  className="size-[5.25rem] shrink-0 rounded-full border-[3px] border-[#1F7A4D] object-cover"
                />
              ) : (
                <span className="flex size-[5.25rem] shrink-0 items-center justify-center rounded-full border-[3px] border-[#1F7A4D] bg-[#E8F5EE] text-2xl font-extrabold text-[#0B1F4D]">
                  {shopTitle.slice(0, 1)}
                </span>
              )}
              <div className="grid min-w-0 flex-1 grid-cols-3">
                <div className="text-center">
                  <p className="text-[17px] font-extrabold leading-none text-[#0B1F4D]">{compactCount(postCount)}</p>
                  <p className="mt-1 text-[11px] text-[#9CA3AF]">Posts</p>
                </div>
                <div className="text-center">
                  <p className="text-[17px] font-extrabold leading-none text-[#0B1F4D]">{productCount}</p>
                  <p className="mt-1 text-[11px] text-[#9CA3AF]">Products</p>
                </div>
                <div className="text-center">
                  <p className="text-[17px] font-extrabold leading-none text-[#0B1F4D]">{compactCount(followerCount)}</p>
                  <p className="mt-1 text-[11px] text-[#9CA3AF]">Followers</p>
                </div>
              </div>
            </section>

            <section className="px-4 pb-3">
              <div className="flex items-center gap-1.5">
                <h1 className="truncate text-[15px] font-extrabold leading-tight text-[#0B1F4D]">{shopTitle}</h1>
                {business.is_verified ? (
                  <BadgeCheck className="size-4 shrink-0 fill-[#1F7A4D] text-white" aria-label="Verified" />
                ) : null}
              </div>
              <p className="mt-0.5 text-[12.5px] font-semibold text-[#1F7A4D]">
                {business.category_name ?? t("app.storefront.defaultCategory")}
              </p>
              {business.description ? (
                <p className="mt-1.5 whitespace-pre-line text-[13px] leading-snug text-[#374151]">
                  {business.description}
                </p>
              ) : null}
              <ul className="mt-2 space-y-1 text-[12.5px] font-medium text-[#6B7280]">
                <li className="flex items-center gap-1.5">
                  <MapPin className="size-3.5 shrink-0 text-[#1F7A4D]" />
                  <span className="truncate">
                    {business.public_location_label ?? business.location_text ?? "Lagos, Nigeria"}
                  </span>
                </li>
                {business.public_phone || business.public_whatsapp ? (
                  <li className="flex items-center gap-1.5">
                    <Phone className="size-3.5 shrink-0 text-[#1F7A4D]" />
                    <a
                      href={`tel:${(business.public_phone ?? business.public_whatsapp ?? "").replace(/\s+/g, "")}`}
                      className="truncate"
                    >
                      {business.public_phone ?? business.public_whatsapp}
                    </a>
                  </li>
                ) : null}
              </ul>
            </section>

            <section className="flex items-center gap-2 px-4 pb-3">
              {isOwner ? (
                <>
                  <Link
                    to="/shop/create"
                    className="flex min-h-10 flex-1 items-center justify-center rounded-lg bg-[#1F7A4D] text-[13px] font-extrabold text-white"
                  >
                    <Plus className="mr-1.5 size-4" />
                    Create Post
                  </Link>
                  <Link
                    to="/app/business/edit"
                    className="flex min-h-10 flex-1 items-center justify-center rounded-lg border border-[#1F7A4D] text-[13px] font-extrabold text-[#1F7A4D]"
                  >
                    Edit shop
                  </Link>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void onFollow()}
                    className={cn(
                      "min-h-10 flex-1 rounded-lg text-[13px] font-extrabold text-white transition-colors",
                      following ? "bg-[#0B1F4D]" : "bg-[#1F7A4D]",
                    )}
                  >
                    {following ? "Following" : "Follow"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void startChat({
                        businessId: business.id,
                        businessName: business.business_name,
                        logoUrl: business.logo_url,
                        businessSlug: business.slug,
                      })
                    }
                    className="flex min-h-10 flex-1 items-center justify-center rounded-lg border border-[#0B1F4D] text-[13px] font-extrabold text-[#0B1F4D]"
                  >
                    <MessageCircle className="mr-1.5 size-4" />
                    Message
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={onSaveShop}
                className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[#1F7A4D]/25 text-[#1F7A4D]"
                aria-label={shopSaved ? "Unsave shop" : "Save shop"}
              >
                <Heart className={cn("size-4", shopSaved && "fill-[#1F7A4D]")} />
              </button>
            </section>

            {!isOwner && (business.public_phone || business.public_whatsapp) ? (
              <section className="flex items-center gap-2 px-4 pb-3">
                {business.public_phone ? (
                  <a
                    href={`tel:${business.public_phone.replace(/\s+/g, "")}`}
                    onClick={() => void recordBusinessInsight(business.id, "call_click")}
                    className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-[#0B1F4D] text-[13px] font-extrabold text-white"
                  >
                    <Phone className="size-4" />
                    Call
                  </a>
                ) : null}
                {business.public_whatsapp ? (
                  <a
                    href={`https://wa.me/${business.public_whatsapp.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => void recordBusinessInsight(business.id, "whatsapp_click")}
                    className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-[#1F7A4D] text-[13px] font-extrabold text-[#1F7A4D]"
                  >
                    WhatsApp
                  </a>
                ) : null}
              </section>
            ) : isOwner && !business.public_phone && !business.public_whatsapp ? (
              <section className="mx-4 mb-2 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-[12px] font-semibold text-amber-800">
                <Phone className="mt-0.5 size-4 shrink-0" />
                <span>
                  Add a contact number so customers can reach you.{" "}
                  <button type="button" className="underline" onClick={openPhoneDialog}>
                    Add phone number
                  </button>
                </span>
              </section>
            ) : null}

            <div className="sticky top-[3.35rem] z-10 bg-white">
              <nav className="grid grid-cols-3 px-2" aria-label="Storefront sections">
                {(
                  [
                    ["posts", "Posts"],
                    ["featured", "Shop"],
                    ["about", "About"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={cn(
                      "relative py-3 text-[14px] font-semibold transition-colors",
                      tab === id ? "text-[#1F7A4D]" : "text-[#9CA3AF]",
                    )}
                  >
                    {label}
                    <span
                      className={cn(
                        "absolute inset-x-6 bottom-0 h-[2.5px] rounded-full bg-[#1F7A4D] transition-opacity duration-200",
                        tab === id ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </button>
                ))}
              </nav>
            </div>

            <div className="min-h-[20rem] px-4 pb-8 pt-4">
              <div key={tab} className="transition-opacity duration-200">
                {tab === "posts" ? (
                  videos.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      {isOwner ? "No posts yet. Share a photo or video of what you sell." : "This shop has no posts yet."}
                    </p>
                  ) : (
                    <ul className="-mx-4 grid grid-cols-3 gap-px bg-[#EEF1F5]">
                      {videos.map((v) => (
                        <li key={v.id}>
                          <ShopPostTile video={v} shopName={shopTitle} />
                        </li>
                      ))}
                    </ul>
                  )
                ) : null}

                {tab === "featured" ? (
                  <>
                    {featured.length === 0 ? (
                      <p className="py-10 text-center text-sm text-muted-foreground">{t("app.storefront.noProducts")}</p>
                    ) : collections.length > 1 ? (
                      collections.map(([title, items]) => (
                        <section key={title} className="mb-6">
                          <h2 className="mb-3 text-[1.05rem] font-extrabold text-[#0B1F4D]">{title}</h2>
                          <ul className="grid grid-cols-2 gap-3">
                            {items.map((p) => (
                              <li key={p.id}>
                                <StoreProductCard product={p} canPost={isOwner} />
                              </li>
                            ))}
                          </ul>
                        </section>
                      ))
                    ) : (
                      <ul className="grid grid-cols-2 gap-3">
                        {featured.map((p) => (
                          <li key={p.id}>
                            <StoreProductCard product={p} canPost={isOwner} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : null}

                {tab === "about" ? (
                  <AboutPanel
                    business={business}
                    hours={DAY_LABELS.filter(([k]) => business.opening_hours?.[k])}
                    voiceLang={voiceLang}
                    name={name}
                    phone={phone}
                    message={message}
                    sending={sending}
                    reporting={reporting}
                    setName={setName}
                    setPhone={setPhone}
                    setMessage={setMessage}
                    onEnquiry={onEnquiry}
                    onReport={() => void onReport()}
                    onChat={() =>
                      void startChat({
                        businessId: business.id,
                        businessName: business.business_name,
                        logoUrl: business.logo_url,
                        businessSlug: business.slug,
                      })
                    }
                  />
                ) : null}
              </div>
            </div>
          </>
        )}

        <Dialog open={phoneOpen} onOpenChange={setPhoneOpen}>
          <DialogContent className="max-w-sm rounded-2xl">
            <DialogHeader>
              <DialogTitle>Add your phone number</DialogTitle>
              <DialogDescription>
                Customers see this number on your shop so they can call or message you.
              </DialogDescription>
            </DialogHeader>
            <Input
              className="min-h-12 rounded-xl text-base"
              value={phoneDraft}
              onChange={(e) => setPhoneDraft(e.target.value)}
              placeholder="080…"
              inputMode="tel"
              autoComplete="tel"
            />
            <DialogFooter className="mt-2">
              <Button
                type="button"
                className="min-h-11 w-full rounded-xl font-bold"
                disabled={phoneSaving}
                onClick={() => void savePhone()}
              >
                {phoneSaving ? "Saving…" : "Save number"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MarketplaceShell>
  );
}

function AboutPanel({
  business,
  hours,
  voiceLang,
  name,
  phone,
  message,
  sending,
  reporting,
  setName,
  setPhone,
  setMessage,
  onEnquiry,
  onReport,
  onChat,
}: {
  business: NonNullable<Awaited<ReturnType<typeof fetchStorefront>>["business"]>;
  hours: [string, string][];
  voiceLang: string;
  name: string;
  phone: string;
  message: string;
  sending: boolean;
  reporting: boolean;
  setName: (v: string) => void;
  setPhone: (v: string) => void;
  setMessage: (v: string) => void;
  onEnquiry: (e: React.FormEvent) => void;
  onReport: () => void;
  onChat: () => void;
}) {
  const { t } = useTranslation();
  const directions =
    business.latitude != null && business.longitude != null
      ? getMapsProvider().directionsUrl({
          lat: business.latitude,
          lng: business.longitude,
          label: business.business_name,
        })
      : null;

  return (
    <div className="space-y-5">
      {business.description ? (
        <div className="space-y-2 text-sm leading-relaxed text-[#374151]">
          <p>{business.description}</p>
          <TranslateText text={business.description} />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {business.public_phone ? (
          <Button asChild className="min-h-11 rounded-xl bg-[#0B1F4D]">
            <a href={`tel:${business.public_phone}`} onClick={() => void recordBusinessInsight(business.id, "call_click")}>
              <Phone className="mr-1.5 size-4" /> {t("app.storefront.call")}
            </a>
          </Button>
        ) : null}
        {business.public_whatsapp ? (
          <Button asChild variant="outline" className="min-h-11 rounded-xl">
            <a
              href={`https://wa.me/${business.public_whatsapp.replace(/[^0-9]/g, "")}`}
              target="_blank"
              rel="noreferrer"
              onClick={() => void recordBusinessInsight(business.id, "whatsapp_click")}
            >
              <MessageCircle className="mr-1.5 size-4" /> {t("app.storefront.whatsapp")}
            </a>
          </Button>
        ) : null}
        {directions ? (
          <Button asChild variant="outline" className="min-h-11 rounded-xl">
            <a href={directions} target="_blank" rel="noreferrer">
              <Navigation className="mr-1.5 size-4" /> {t("app.storefront.directions")}
            </a>
          </Button>
        ) : null}
      </div>

      {hours.length > 0 ? (
        <section>
          <h2 className="flex items-center gap-2 font-bold text-[#0B1F4D]">
            <Clock className="size-4" /> {t("app.storefront.openingHours")}
          </h2>
          <ul className="mt-2 divide-y divide-border rounded-2xl border border-border">
            {hours.map(([k, label]) => (
              <li key={k} className="flex justify-between px-4 py-2 text-sm">
                <span>{label}</span>
                <span className="font-semibold">{business.opening_hours[k]}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-bold text-[#0B1F4D]">Message this shop</h2>
        <p className="mt-1 text-sm text-muted-foreground">Chat with the seller about products, prices, or pickup.</p>
        <Button type="button" className="mt-3 min-h-11 w-full rounded-xl bg-[#0B1F4D] font-bold" onClick={onChat}>
          <MessageCircle className="mr-2 size-4" />
          Open chat
        </Button>
        <h2 className="mt-6 font-bold text-[#0B1F4D]">{t("app.storefront.enquiryTitle")}</h2>
        <form className="mt-3 space-y-2" onSubmit={onEnquiry}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("app.storefront.namePlaceholder")} className="min-h-11 rounded-xl" />
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("app.storefront.phonePlaceholder")} className="min-h-11 rounded-xl" />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("app.storefront.messagePlaceholder")}
            className="min-h-24 w-full rounded-xl border px-3 py-2 text-sm"
          />
          <VoiceTranslate language={voiceLang} onUseTranscript={(text) => setMessage((cur) => (cur ? `${cur} ${text}` : text))} />
          <Button type="submit" className="min-h-11 w-full rounded-xl bg-[#1F7A4D]" disabled={sending}>
            {sending ? t("app.storefront.sending") : t("app.storefront.sendMessage")}
          </Button>
        </form>
      </section>

      <Button type="button" variant="ghost" size="sm" className="rounded-xl text-muted-foreground" disabled={reporting} onClick={onReport}>
        <Flag className="mr-1 size-4" /> Report
      </Button>
    </div>
  );
}
