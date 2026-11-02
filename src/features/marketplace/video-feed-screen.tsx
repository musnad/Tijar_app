"use client";

import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  BadgeCheck,
  Bell,
  ChevronRight,
  Flag,
  Gavel,
  Heart,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Send,
  Share2,
  ShoppingBag,
  ShoppingCart,
  UtensilsCrossed,
} from "lucide-react";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShareSheet } from "@/components/share-sheet";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { useAuth } from "@/features/auth/auth-context";
import { displayShopName, isBlankShopName, shopLinkSlug } from "@/lib/shop-names";
import { cn } from "@/lib/utils";
import { addToCart, fetchBusinessPayoutAccount, fetchCart, fetchMarketplaceProducts, toggleFavoriteProduct } from "@/services/marketplace-service";
import { formatServiceDates, serviceLabel } from "@/lib/catalogue/service-schedule";
import { parseVariantList } from "@/lib/catalogue/variants";
import { TijarLogo } from "@/components/brand-logo";
import { FeedImage } from "@/components/media/feed-image";
import { MediaCarousel } from "@/components/media/media-carousel";
import { FeedSkeleton } from "@/features/marketplace/feed-skeleton";
import { AppLanguageButton } from "@/features/app-layout/app-language-button";
import { useTranslation } from "@/lib/i18n/context";
import {
  blockProfile,
  fetchLiveProductsByIds,
  fetchMyFollowedBusinessIds,
  fetchMyLikedVideoIds,
  fetchMySavedVideoIds,
  fetchVideoComments,
  muteProfile,
  postVideoComment,
  FEED_PAGE_SIZE,
  rankAndLoadFeed,
  recordFeedSignal,
  reportVideo,
  isImagePost,
  isBidPost,
  productGallery,
  resolveCoverSrc,
  resolvePostGallery,
  resolveVideoSrc,
  toggleFollowBusiness,
  toggleVideoLike,
  toggleVideoSave,
  type PublicFeedVideo,
} from "@/services/video-feed-service";
import type { PublicProduct } from "@/types/database";
import { ensureSavedProduct, listFollowedShopIds, loadUserSocial } from "@/lib/shop-social";
import { useDoubleTap } from "@/lib/use-double-tap";
import { haptic } from "@/lib/haptics";
import { formatNgn } from "@/utils/money";
import { isMockFeedId } from "@/features/marketplace/feed-mock";
import { ProductSocialBar } from "@/features/marketplace/product-social";
import {
  categoryLabel,
  dayLabel,
  fetchPlaceOrderListings,
  placeOrderRemaining,
  placeOrderSoldOut,
  type PlaceOrderListing,
} from "@/services/place-order-service";
import { useStartShopChat } from "@/features/marketplace/use-start-shop-chat";
import {
  bidPhase,
  bidPaymentSecondsLeft,
  confirmBidPayment,
  markBidPaid,
  placeBid,
  releaseBidUnpaid,
} from "@/services/bid-service";
import { usePrimaryBusiness } from "@/hooks/use-primary-business";

type FeedTab = "foryou" | "following" | "nearby";

const POSITION_KEY = "tijar-for-you-video-id";
const DATA_SAVER_KEY = "tijar-feed-data-saver";
const EMPTY_VIDEOS: PublicFeedVideo[] = [];
const EMPTY_PRODUCTS: PublicProduct[] = [];
const SLIDE_STYLE = {
  contentVisibility: "auto" as const,
  containIntrinsicSize: "auto 820px",
};

type FeedActions = {
  onLike: (video: PublicFeedVideo) => void;
  onSave: (video: PublicFeedVideo) => void;
  onFollowShop: (businessId: string, businessName: string) => void;
  onRecordShare: (video: PublicFeedVideo) => void;
  onOpenProducts: (videoId: string) => void;
  onOpenComments: (videoId: string) => void;
  onMore: (videoId: string) => void;
  onEnded: (videoId: string) => void;
  onAddProduct: (video: PublicFeedVideo | null, product: PublicProduct) => void;
  onTogglePause: () => void;
};

/** One slide in the feed, whatever its content type, so the stream can be ordered by recency. */
type FeedItem =
  | { kind: "place"; key: string; ts: number; listing: PlaceOrderListing }
  | { kind: "video"; key: string; ts: number; video: PublicFeedVideo }
  | { kind: "listing"; key: string; ts: number; product: PublicProduct };

function feedTimestamp(value: string | null | undefined): number {
  const t = value ? Date.parse(value) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

const FeedActionsContext = createContext<FeedActions | null>(null);

function useFeedActions(): FeedActions {
  const ctx = useContext(FeedActionsContext);
  if (!ctx) throw new Error("FeedActionsContext missing");
  return ctx;
}

function productsForVideo(
  video: PublicFeedVideo,
  productsById: Map<string, PublicProduct>,
  listingsByBusiness: Map<string, PublicProduct[]>,
): PublicProduct[] {
  const tagged = (video.product_ids ?? []).map((id) => productsById.get(id)).filter(Boolean) as PublicProduct[];
  if (tagged.length > 0) return tagged;
  return listingsByBusiness.get(video.business_id) ?? EMPTY_PRODUCTS;
}

function compactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Live countdown (in seconds) to a future timestamp, ticking every second. */
function useSecondsTo(target: string | null | undefined): number {
  const compute = useCallback(() => {
    if (!target) return 0;
    const ms = new Date(target).getTime() - Date.now();
    return ms > 0 ? Math.ceil(ms / 1000) : 0;
  }, [target]);
  const [secs, setSecs] = useState(compute);
  useEffect(() => {
    setSecs(compute());
    if (!target) return;
    const id = window.setInterval(() => setSecs(compute()), 1000);
    return () => window.clearInterval(id);
  }, [compute, target]);
  return secs;
}

function fmtCountdown(secs: number): string {
  if (secs <= 0) return "0s";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function CaptionText({ text, light }: { text: string; light?: boolean }) {
  const parts = text.split(/(#[\p{L}\p{N}_]+)/gu);
  return (
    <span className={cn("mt-1 text-[14px] leading-snug", light ? "text-white/95" : "text-zinc-800")}>
      {parts.map((part, i) =>
        part.startsWith("#") ? (
          <span key={`${part}-${i}`} className="font-semibold text-primary">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}

function variantSummary(product: PublicProduct): string | null {
  const variants = parseVariantList(product.variants);
  const sizes = [...new Set(variants.map((v) => v.size).filter(Boolean))];
  const colours = [...new Set(variants.map((v) => v.colour).filter(Boolean))];
  const attrs = product.attributes ?? {};
  if (!sizes.length && attrs.size) sizes.push(attrs.size);
  if (!colours.length && attrs.colour) colours.push(attrs.colour);
  const bits: string[] = [];
  if (sizes.length) bits.push(`Sizes: ${sizes.join(", ")}`);
  if (colours.length) bits.push(`Colour: ${colours.join(", ")}`);
  return bits.length ? bits.join(" · ") : null;
}

export function VideoFeedScreen({ initialVideoId }: { initialVideoId?: string }) {
  const { profile, session } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(initialVideoId ?? null);
  const [dataSaver] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(DATA_SAVER_KEY) === "1";
  });
  const [paused, setPaused] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [feedTab, setFeedTab] = useState<FeedTab>("foryou");
  const [mockLiked, setMockLiked] = useState(() => new Set(loadUserSocial("guest").likedVideos));
  const [mockFollowing, setMockFollowing] = useState(() => new Set(listFollowedShopIds("guest")));
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = profile?.id ?? "guest";
    setMockFollowing(new Set(listFollowedShopIds(id)));
    setMockLiked(new Set(loadUserSocial(id).likedVideos));
  }, [profile?.id]);

  const feedQuery = useInfiniteQuery({
    queryKey: ["video-feed", profile?.id ?? "anon"],
    queryFn: async ({ pageParam }) => {
      const r = await rankAndLoadFeed(profile?.id ?? null, {
        limit: FEED_PAGE_SIZE,
        before: pageParam,
      });
      if (r.error) throw new Error(r.error);
      return r;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 60_000,
    refetchOnMount: false,
  });

  const listingsQuery = useQuery({
    queryKey: ["for-you-listings"],
    queryFn: async () => {
      const r = await fetchMarketplaceProducts(24);
      if (r.error) throw new Error(r.error);
      return r.data;
    },
    staleTime: 60_000,
  });

  const placeOrdersQuery = useQuery({
    queryKey: ["for-you-place-orders"],
    queryFn: async () => (await fetchPlaceOrderListings({ day: "all" })).listings,
    staleTime: 30_000,
  });

  const liveVideos = useMemo(() => {
    const pages = feedQuery.data?.pages ?? [];
    const seen = new Set<string>();
    const out: PublicFeedVideo[] = [];
    for (const page of pages) {
      for (const video of page.videos) {
        if (seen.has(video.id)) continue;
        seen.add(video.id);
        out.push(video);
      }
    }
    return out.length ? out : EMPTY_VIDEOS;
  }, [feedQuery.data]);
  const liveListings = listingsQuery.data ?? [];
  const productIds = useMemo(
    () => [...new Set(liveVideos.flatMap((v) => v.product_ids ?? []))],
    [liveVideos],
  );
  const restoredRef = useRef(false);

  const productsQuery = useQuery({
    queryKey: ["video-feed-products", productIds.join(",")],
    enabled: productIds.length > 0,
    queryFn: async () => {
      const r = await fetchLiveProductsByIds(productIds);
      if (r.error) throw new Error(r.error);
      return r.products;
    },
    staleTime: 60_000,
  });

  const likedQuery = useQuery({
    queryKey: ["video-likes", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => fetchMyLikedVideoIds(profile!.id),
  });
  const savedQuery = useQuery({
    queryKey: ["video-saves", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => fetchMySavedVideoIds(profile!.id),
  });
  const followQuery = useQuery({
    queryKey: ["video-follows", profile?.id ?? "guest"],
    queryFn: async () => fetchMyFollowedBusinessIds(profile?.id ?? "guest"),
  });
  const cartQuery = useQuery({
    queryKey: ["marketplace-cart", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => (await fetchCart(profile!.id)).items,
  });

  const productsById = useMemo(() => {
    const m = new Map<string, PublicProduct>();
    for (const p of liveListings) m.set(p.id, p);
    for (const p of productsQuery.data ?? []) m.set(p.id, p);
    return m;
  }, [liveListings, productsQuery.data]);

  const listingsByBusiness = useMemo(() => {
    const m = new Map<string, PublicProduct[]>();
    for (const p of liveListings) {
      const list = m.get(p.business_id);
      if (list) list.push(p);
      else m.set(p.business_id, [p]);
    }
    return m;
  }, [liveListings]);

  const videos = useMemo(() => {
    return liveVideos.map((video) => {
      const tagged = (video.product_ids ?? []).map((id) => productsById.get(id)).find(Boolean);
      const sameShop = liveListings.find((p) => p.business_id === video.business_id);
      const hint = tagged ?? sameShop;
      if (!hint && !isBlankShopName(video.business_name) && video.slug) return video;
      return {
        ...video,
        business_name: displayShopName(video.business_name, hint?.business_name),
        slug: shopLinkSlug(video.slug, hint?.business_slug ?? video.business_id),
        business_logo_url: video.business_logo_url ?? hint?.business_logo_url ?? null,
      };
    });
  }, [liveVideos, liveListings, productsById]);

  const active = videos.find((v) => v.id === activeId) ?? videos[0] ?? null;

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, []);

  useEffect(() => {
    if (restoredRef.current || videos.length === 0) return;
    restoredRef.current = true;
    if (initialVideoId && videos.some((v) => v.id === initialVideoId)) {
      setActiveId(initialVideoId);
      const root = scrollerRef.current;
      const node = root?.querySelector(`[data-video-id="${initialVideoId}"]`) as HTMLElement | null;
      if (root && node) root.scrollTop = node.offsetTop;
      return;
    }
    setActiveId(videos[0]!.id);
  }, [videos, initialVideoId]);

  useEffect(() => {
    if (activeId) sessionStorage.setItem(POSITION_KEY, activeId);
    setPaused(false);
  }, [activeId]);

  const feedTabRef = useRef(feedTab);
  useEffect(() => {
    if (feedTabRef.current === feedTab) return;
    feedTabRef.current = feedTab;
    const root = scrollerRef.current;
    if (root) root.scrollTop = 0;
  }, [feedTab]);

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const id = (visible?.target as HTMLElement | undefined)?.dataset.videoId;
        if (id) setActiveId((cur) => (cur === id ? cur : id));
      },
      { root, threshold: [0.35, 0.55, 0.75] },
    );
    root.querySelectorAll("[data-video-id]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [videos.length, liveListings.length, feedTab]);

  useEffect(() => {
    if (!activeId || activeId.startsWith("listing:") || isMockFeedId(activeId)) return;
    void recordFeedSignal(activeId, "impression");
    void recordFeedSignal(activeId, "view");
  }, [activeId]);

  const cartCount = cartQuery.data?.reduce((n, i) => n + Number(i.quantity), 0) ?? 0;

  function requireUser(): boolean {
    if (!session || !profile) {
      toast.message("Sign in to do that.");
      void navigate({ to: "/login" });
      return false;
    }
    return true;
  }

  const patchFeedStat = useCallback(
    (videoId: string, field: "like_count" | "comment_count" | "share_count", delta: number) => {
      queryClient.setQueryData(
        ["video-feed", profile?.id ?? "anon"],
        (old: { pages: Array<{ videos: PublicFeedVideo[]; nextCursor: string | null }>; pageParams: unknown[] } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              videos: page.videos.map((v) =>
                v.id === videoId
                  ? { ...v, [field]: Math.max(0, Number(v[field] ?? 0) + delta) }
                  : v,
              ),
            })),
          };
        },
      );
    },
    [profile?.id, queryClient],
  );

  const patchFeedLike = useCallback(
    (videoId: string, liked: boolean) => {
      queryClient.setQueryData(["video-likes", profile?.id], (prev: Set<string> | undefined) => {
        const next = new Set(prev ?? []);
        if (liked) next.add(videoId);
        else next.delete(videoId);
        return next;
      });
      patchFeedStat(videoId, "like_count", liked ? 1 : -1);
    },
    [patchFeedStat, profile?.id, queryClient],
  );

  const feedActions = useMemo<FeedActions>(
    () => ({
      onTogglePause: () => setPaused((p) => !p),
      onLike: (video) => {
        void (async () => {
          if (!requireUser() || !profile) return;
          haptic();
          const { liked, error } = await toggleVideoLike(profile.id, video.id);
          if (error) toast.error(error);
          else {
            void recordFeedSignal(video.id, "like");
            setMockLiked((prev) => {
              const copy = new Set(prev);
              if (liked) copy.add(video.id);
              else copy.delete(video.id);
              return copy;
            });
            patchFeedLike(video.id, liked);
          }
        })();
      },
      onSave: (video) => {
        void (async () => {
          if (!requireUser() || !profile) return;
          const { saved, error } = await toggleVideoSave(profile.id, video.id);
          if (error) toast.error(error);
          else {
            toast.success(saved ? "Saved" : "Removed");
            void queryClient.invalidateQueries({ queryKey: ["video-saves"] });
          }
        })();
      },
      onFollowShop: (businessId, businessName) => {
        void (async () => {
          if (!requireUser() || !profile) return;
          haptic("success");
          const { following, error } = await toggleFollowBusiness(profile.id, businessId, profile.full_name);
          if (error) toast.error(error);
          else {
            setMockFollowing((prev) => {
              const copy = new Set(prev);
              if (following) copy.add(businessId);
              else copy.delete(businessId);
              return copy;
            });
            toast.success(following ? `Following ${businessName}` : "Unfollowed");
            void queryClient.invalidateQueries({ queryKey: ["video-follows"] });
            void queryClient.invalidateQueries({ queryKey: ["followed-ids"] });
            void queryClient.invalidateQueries({ queryKey: ["followed-shops"] });
            void queryClient.invalidateQueries({ queryKey: ["shop-followers"] });
            void queryClient.invalidateQueries({ queryKey: ["followed-people"] });
            void queryClient.invalidateQueries({ queryKey: ["activity-inbox"] });
          }
        })();
      },
      onRecordShare: (video) => {
        if (isMockFeedId(video.id)) return;
        patchFeedStat(video.id, "share_count", 1);
        void recordFeedSignal(video.id, "share");
      },
      onOpenProducts: (videoId) => {
        setActiveId(videoId);
        setProductsOpen(true);
        void recordFeedSignal(videoId, "product_tap");
      },
      onOpenComments: (videoId) => {
        haptic();
        setActiveId(videoId);
        setCommentsOpen(true);
      },
      onMore: (videoId) => {
        setActiveId(videoId);
        setMoreOpen(true);
      },
      onEnded: (videoId) => {
        if (!isMockFeedId(videoId)) void recordFeedSignal(videoId, "complete");
      },
      onAddProduct: (video, product) => {
        void (async () => {
          if (!requireUser()) return;
          haptic("success");
          ensureSavedProduct(profile?.id ?? "guest", product);
          if (isMockFeedId(product.id) || !profile) {
            toast.message("This listing is no longer available.");
            return;
          }
          if (product.sale_price == null) {
            toast.message("This listing has no price yet.");
            return;
          }
          const { error } = await addToCart(profile.id, {
            businessId: product.business_id,
            productId: product.id,
            productName: product.name,
            unit: product.unit,
            unitPrice: Number(product.sale_price),
            imageUrl: product.image_url,
          });
          if (error) toast.error(error);
          else {
            toast.success("Added to cart and Saved Products");
            void queryClient.invalidateQueries({ queryKey: ["marketplace-cart"] });
            void queryClient.invalidateQueries({ queryKey: ["marketplace-favorites"] });
            if (video && !isMockFeedId(video.id)) void recordFeedSignal(video.id, "add_to_cart");
          }
        })();
      },
    }),
    [patchFeedLike, patchFeedStat, profile, queryClient, session],
  );

  const fetchNextPage = feedQuery.fetchNextPage;
  const hasNextPage = feedQuery.hasNextPage;
  const isFetchingNextPage = feedQuery.isFetchingNextPage;

  const taggedIds = new Set(productIds);
  const extraListings = liveListings.filter((p) => !taggedIds.has(p.id));
  const followed = followQuery.data ?? new Set<string>();
  const showPosts =
    feedTab === "nearby"
      ? []
      : feedTab === "following"
        ? videos.filter((v) => followed.has(v.business_id))
        : videos;
  const showListings =
    feedTab === "nearby" ? liveListings : feedTab === "foryou" ? extraListings : [];
  const showPlaceOrders =
    feedTab === "following" ? [] : (placeOrdersQuery.data ?? []);
  const activeIndex = showPosts.findIndex((v) => v.id === activeId);
  const productsByVideo = useMemo(() => {
    const map = new Map<string, PublicProduct[]>();
    for (const video of showPosts) {
      map.set(video.id, productsForVideo(video, productsById, listingsByBusiness));
    }
    return map;
  }, [showPosts, productsById, listingsByBusiness]);

  // Merge posts, product listings and place-order posts into ONE stream sorted by
  // recency, so a fresh post always lands on top instead of being grouped by type.
  const feedItems = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [];
    for (const listing of showPlaceOrders) {
      items.push({ kind: "place", key: `place:${listing.id}`, ts: feedTimestamp(listing.created_at), listing });
    }
    for (const video of showPosts) {
      items.push({
        kind: "video",
        key: `video:${video.id}`,
        ts: feedTimestamp(video.published_at ?? video.created_at),
        video,
      });
    }
    for (const product of showListings) {
      items.push({ kind: "listing", key: `listing:${product.id}`, ts: feedTimestamp(product.created_at), product });
    }
    return items.sort((a, b) => b.ts - a.ts);
  }, [showPlaceOrders, showPosts, showListings]);

  const videoIndexById = useMemo(() => {
    const m = new Map<string, number>();
    showPosts.forEach((v, i) => m.set(v.id, i));
    return m;
  }, [showPosts]);

  useEffect(() => {
    const root = scrollerRef.current;
    const el = loadMoreRef.current;
    if (!root || !el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { root, rootMargin: "1200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, showPosts.length]);

  return (
    <MarketplaceShell cartCount={cartCount} hideTopBar variant="feed">
      <div className="relative mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col overflow-hidden bg-white text-foreground">
        <FeedTopBar tab={feedTab} onTab={setFeedTab} />

        <FeedActionsContext.Provider value={feedActions}>
        <div
          ref={scrollerRef}
          style={{ WebkitOverflowScrolling: "touch" }}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y [overflow-anchor:none] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {feedQuery.isPending
            ? Array.from({ length: 3 }, (_, i) => <FeedSkeleton key={`sk-${i}`} />)
            : null}
          {feedItems.map((item) => {
            if (item.kind === "place") {
              return (
                <PlaceOrderSlide
                  key={item.key}
                  listing={item.listing}
                  following={
                    followQuery.data?.has(item.listing.business_id) ||
                    mockFollowing.has(item.listing.business_id)
                  }
                />
              );
            }
            if (item.kind === "listing") {
              return (
                <ListingSlide
                  key={item.key}
                  product={item.product}
                  following={
                    followQuery.data?.has(item.product.business_id) ||
                    mockFollowing.has(item.product.business_id)
                  }
                />
              );
            }
            const video = item.video;
            const index = videoIndexById.get(video.id) ?? 0;
            const idx = activeIndex < 0 ? 0 : activeIndex;
            const mountMedia = index >= idx - 1 && index <= idx + 2;
            const isActive = activeId === video.id;
            const isNext = index === idx + 1;
            return (
              <VideoSlide
                key={item.key}
                video={video}
                active={isActive}
                paused={paused}
                mounted={mountMedia}
                preload={isActive || (!dataSaver && isNext)}
                eagerPreload={isNext}
                products={productsByVideo.get(video.id) ?? EMPTY_PRODUCTS}
                liked={likedQuery.data?.has(video.id) ?? mockLiked.has(video.id)}
                saved={savedQuery.data?.has(video.id) ?? false}
                following={followQuery.data?.has(video.business_id) || mockFollowing.has(video.business_id)}
              />
            );
          })}
          {feedQuery.isPending ? null : showPosts.length === 0 && showListings.length === 0 && showPlaceOrders.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
              <ShoppingBag className="size-10 text-primary/40" />
              <p className="font-extrabold text-foreground">
                {feedTab === "following" ? "Follow a shop to see their posts" : "Nothing live yet"}
              </p>
              <p className="text-sm text-muted-foreground">
                {feedTab === "nearby"
                  ? "Open Nearby to find shops around you."
                  : "When a shop posts a photo or video, it appears here."}
              </p>
              <Button asChild className="min-h-11 rounded-full bg-primary font-bold hover:bg-primary/90">
                <Link to={feedTab === "nearby" ? "/shop/nearby" : "/shop/discover"}>
                  {feedTab === "nearby" ? "Open map" : "Open Explore"}
                </Link>
              </Button>
            </div>
          ) : null}
          <div ref={loadMoreRef} className="h-8 shrink-0" aria-hidden />
          {isFetchingNextPage ? <FeedSkeleton /> : null}
        </div>
        </FeedActionsContext.Provider>
      </div>

      <Sheet open={productsOpen} onOpenChange={setProductsOpen}>
        <SheetContent side="bottom" className="max-h-[75vh] overflow-y-auto rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>{t("shop.feed.productsInVideo")}</SheetTitle>
          </SheetHeader>
          {active ? (
            <ProductList
              video={active}
              products={(active.product_ids ?? [])
                .map((id) => productsById.get(id))
                .filter(Boolean) as PublicProduct[]}
              onAdded={() => {
                void recordFeedSignal(active.id, "add_to_cart");
                void queryClient.invalidateQueries({ queryKey: ["marketplace-cart"] });
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <Sheet open={commentsOpen} onOpenChange={setCommentsOpen}>
        <SheetContent side="bottom" className="flex max-h-[85vh] flex-col overflow-hidden rounded-t-3xl p-0">
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted" />
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle className="text-center text-[16px] font-extrabold">
              {t("shop.feed.comments")}
              {active ? ` · ${compactCount(active.comment_count)}` : ""}
            </SheetTitle>
          </SheetHeader>
          {active ? (
            <CommentsThread
              videoId={active.id}
              shopName={active.business_name}
              onPosted={() => patchFeedStat(active.id, "comment_count", 1)}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>Safety</SheetTitle>
          </SheetHeader>
          {active ? (
            <div className="mt-4 grid gap-2">
              <Button
                variant="outline"
                className="justify-start rounded-xl"
                onClick={async () => {
                  if (!requireUser() || !profile) return;
                  const { error } = await reportVideo({
                    reporterId: profile.id,
                    videoId: active.id,
                    businessId: active.business_id,
                    reason: "spam",
                  });
                  if (error) toast.error(error);
                  else toast.success("Report sent to admins");
                  setMoreOpen(false);
                }}
              >
                <Flag className="mr-2 size-4" /> Report video
              </Button>
              <Button
                variant="outline"
                className="justify-start rounded-xl"
                onClick={async () => {
                  if (!requireUser() || !profile) return;
                  const { error } = await muteProfile(profile.id, active.profile_id);
                  if (error) toast.error(error);
                  else toast.success("Creator muted in For You");
                  setMoreOpen(false);
                  void queryClient.invalidateQueries({ queryKey: ["video-feed"] });
                }}
              >
                Mute creator
              </Button>
              <Button
                variant="outline"
                className="justify-start rounded-xl"
                onClick={async () => {
                  if (!requireUser() || !profile) return;
                  const { error } = await blockProfile(profile.id, active.profile_id);
                  if (error) toast.error(error);
                  else toast.success("Account blocked");
                  setMoreOpen(false);
                  void queryClient.invalidateQueries({ queryKey: ["video-feed"] });
                }}
              >
                Block account
              </Button>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </MarketplaceShell>
  );
}

function FeedTopBar({ tab, onTab }: { tab: FeedTab; onTab: (t: FeedTab) => void }) {
  const { profile, session } = useAuth();
  const { t } = useTranslation();
  const unreadQuery = useQuery({
    queryKey: ["activity-inbox", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      const { fetchActivityNotifications } = await import("@/services/social-service");
      const r = await fetchActivityNotifications(profile!.id);
      if (r.error && /does not exist|schema cache/i.test(r.error)) return { items: [], unread: 0 };
      if (r.error) throw new Error(r.error);
      return r;
    },
  });
  const unread = unreadQuery.data?.unread ?? 0;
  const tabs: { id: FeedTab; label: string }[] = [
    { id: "foryou", label: t("shop.feed.forYou") },
    { id: "following", label: t("shop.feed.following") },
    { id: "nearby", label: t("shop.feed.nearby") },
  ];
  const name = profile?.full_name ?? "";
  const initials = name
    ? name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0])
        .join("")
        .toUpperCase()
    : "";

  return (
    <header className="shrink-0 border-b border-border bg-white pt-[max(0.4rem,env(safe-area-inset-top))]">
      <div className="flex min-h-12 items-center gap-1 px-3 py-1.5">
        <Link to="/shop" className="flex min-w-0 flex-1 flex-col justify-center">
          <TijarLogo compact className="h-8 max-w-[148px] object-left" />
          <p className="mt-0.5 text-[9px] font-extrabold uppercase tracking-[0.16em] text-primary">
            {t("shop.feed.brand")}
          </p>
        </Link>
        <AppLanguageButton />
        <Link
          to="/shop/favorites"
          aria-label={t("shop.feed.saved")}
          className="flex size-11 min-h-11 min-w-11 items-center justify-center text-foreground"
        >
          <Heart className="size-5" />
        </Link>
        <Link
          to="/shop/notifications"
          aria-label={t("shop.feed.notifications")}
          className="relative flex size-11 min-h-11 min-w-11 items-center justify-center text-foreground"
        >
          <Bell className="size-5" />
          {unread > 0 ? (
            <span className="absolute right-1.5 top-1.5 min-w-4 rounded-full bg-primary px-1 text-center text-[9px] font-extrabold leading-4 text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Link>
        <Link
          to={session ? "/shop/profile" : "/login"}
          aria-label={t("shop.feed.profile")}
          className="flex size-9 min-h-9 min-w-9 items-center justify-center overflow-hidden rounded-full bg-[color:var(--brand-navy,#001B3A)] text-[10px] font-bold text-white"
        >
          {profile?.avatar_url ? (
            <FeedImage src={profile.avatar_url} alt="" eager width={72} />
          ) : (
            initials || "?"
          )}
        </Link>
      </div>
      <nav className="grid grid-cols-3" aria-label="Feed">
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                haptic();
                onTab(item.id);
              }}
              className={cn(
                "relative flex min-h-11 items-center justify-center px-2 text-[14px]",
                active ? "font-extrabold text-primary" : "font-semibold text-muted-foreground",
              )}
            >
              {item.label}
              {active ? <span className="absolute inset-x-8 bottom-0 h-[3px] rounded-full bg-primary" /> : null}
            </button>
          );
        })}
      </nav>
    </header>
  );
}

const BidPanel = memo(function BidPanel({ video }: { video: PublicFeedVideo }) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const businessQuery = usePrimaryBusiness(profile?.id);
  const phase = bidPhase(video);
  const isOwner = Boolean(profile?.id && businessQuery.data?.business?.id === video.business_id);
  const isWinner = Boolean(profile?.id && video.bid_winner_id === profile.id);

  const starting = video.bid_starting_price != null ? Number(video.bid_starting_price) : 0;
  const limit = video.bid_sale_limit != null ? Number(video.bid_sale_limit) : null;
  const topBid = video.top_bid != null ? Number(video.top_bid) : null;
  const minNext = Math.max(topBid != null ? topBid + 1 : starting, starting);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const endsIn = useSecondsTo(video.bid_ends_at);
  const startsIn = useSecondsTo(video.bid_starts_at);
  const payIn = useSecondsTo(bidPaymentSecondsLeft(video) > 0 ? video.bid_payment_due_at : null);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["video-feed"] });
  }

  async function submitBid() {
    const value = Number(amount.replace(/,/g, ""));
    if (!(value > 0)) {
      toast.error("Enter a bid amount.");
      return;
    }
    setBusy(true);
    const r = await placeBid(video.id, value);
    setBusy(false);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    setSheetOpen(false);
    setAmount("");
    haptic("success");
    toast.success("Bid placed.");
    await refresh();
  }

  const chip =
    phase === "paid"
      ? { label: "Paid", cls: "bg-[#1F7A4D] text-white" }
      : phase === "sold"
        ? { label: "Sold", cls: "bg-[#0B1F4D] text-white" }
        : phase === "upcoming"
          ? { label: "Starts soon", cls: "bg-[#EEF1F5] text-[#0B1F4D]" }
          : phase === "ended"
            ? { label: "Ended", cls: "bg-[#EEF1F5] text-[#6B7280]" }
            : { label: "Live", cls: "bg-[#1F7A4D] text-white" };

  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAF9] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[13px] font-extrabold text-[#0B1F4D]">
          <Gavel className="size-4 text-[#1F7A4D]" />
          Bidding
        </span>
        <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide", chip.cls)}>
          {chip.label}
        </span>
      </div>

      {phase === "sold" || phase === "paid" ? (
        <p className="mt-2 text-[15px] font-extrabold text-[#0B1F4D]">
          Sold to {video.bid_winner_name || "the top bidder"}
        </p>
      ) : null}

      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-[#6B7280]">
            {topBid != null ? "Current bid" : "Starting price"}
          </p>
          <p className="text-[18px] font-black text-[#1F7A4D]">{formatNgn(topBid ?? starting)}</p>
        </div>
        <div className="shrink-0 text-right">
          {phase === "upcoming" ? (
            <>
              <p className="text-[11px] uppercase tracking-wide text-[#6B7280]">Starts in</p>
              <p className="text-[13px] font-extrabold text-[#0B1F4D]">{fmtCountdown(startsIn)}</p>
            </>
          ) : phase === "open" ? (
            <>
              <p className="text-[11px] uppercase tracking-wide text-[#6B7280]">Ends in</p>
              <p className="text-[13px] font-extrabold text-[#0B1F4D]">{fmtCountdown(endsIn)}</p>
            </>
          ) : null}
        </div>
      </div>

      {limit != null && (phase === "open" || phase === "upcoming") ? (
        <p className="mt-1 text-[11px] font-semibold text-[#6B7280]">
          Sells instantly at {formatNgn(limit)}
          {video.bid_count ? ` · ${video.bid_count} ${video.bid_count === 1 ? "bid" : "bids"}` : ""}
        </p>
      ) : null}

      {phase === "sold" && payIn > 0 ? (
        <p className="mt-2 text-[12px] font-semibold text-amber-700">
          {video.bid_buyer_marked_paid_at
            ? "Winner says they have paid — confirm to finish."
            : `Winner has ${fmtCountdown(payIn)} to pay.`}
        </p>
      ) : null}

      {phase === "open" ? (
        <>
          <Button
            type="button"
            className="mt-3 min-h-11 w-full rounded-xl bg-[#1F7A4D] font-extrabold text-white hover:bg-[#1F7A4D]/90"
            onClick={() => {
              setAmount(String(minNext));
              setSheetOpen(true);
            }}
          >
            Place a bid
          </Button>
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent side="bottom" className="rounded-t-3xl">
              <SheetHeader>
                <SheetTitle>Place a bid</SheetTitle>
              </SheetHeader>
              <div className="mt-3 space-y-3 px-1 pb-6">
                <p className="text-[13px] text-muted-foreground">
                  Starting {formatNgn(starting)}
                  {topBid != null ? ` · highest bid ${formatNgn(topBid)}` : ""}
                </p>
                <Input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={`${formatNgn(minNext)} or more`}
                  className="min-h-12 rounded-xl"
                />
                <Button
                  type="button"
                  className="min-h-12 w-full rounded-xl bg-[#1F7A4D] font-extrabold text-white hover:bg-[#1F7A4D]/90"
                  disabled={busy}
                  onClick={() => void submitBid()}
                >
                  {busy ? "Placing…" : "Place bid"}
                </Button>
                {limit != null ? (
                  <p className="text-[11px] text-muted-foreground">
                    A bid of {formatNgn(limit)} or more buys it instantly.
                  </p>
                ) : null}
              </div>
            </SheetContent>
          </Sheet>
        </>
      ) : null}

      {phase === "upcoming" ? (
        <p className="mt-3 rounded-xl bg-white px-3 py-2 text-center text-[13px] font-bold text-[#6B7280]">
          Bidding opens soon
        </p>
      ) : null}

      {phase === "ended" ? (
        <p className="mt-3 rounded-xl bg-white px-3 py-2 text-center text-[13px] font-bold text-[#6B7280]">
          Bidding finished — no sale
        </p>
      ) : null}

      {phase === "sold" && isWinner ? <WinnerPayment video={video} /> : null}
      {phase === "sold" && isOwner ? <OwnerSoldActions video={video} /> : null}
    </div>
  );
});

function WinnerPayment({ video }: { video: PublicFeedVideo }) {
  const queryClient = useQueryClient();
  const accountQuery = useQuery({
    queryKey: ["payout-account", video.business_id],
    queryFn: async () => (await fetchBusinessPayoutAccount(video.business_id)).account,
  });
  const account = accountQuery.data ?? null;
  const markedPaid = Boolean(video.bid_buyer_marked_paid_at);
  const [busy, setBusy] = useState(false);

  async function sayPaid() {
    setBusy(true);
    const r = await markBidPaid(video.id);
    setBusy(false);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    haptic("success");
    toast.success("Told the shop you have paid. They will confirm.");
    await queryClient.invalidateQueries({ queryKey: ["video-feed"] });
  }

  return (
    <div className="mt-3 rounded-xl border border-[#E5E7EB] bg-white p-3">
      <p className="text-[13px] font-extrabold text-[#0B1F4D]">You won — pay to keep it</p>
      {account?.payout_account_number ? (
        <>
          <dl className="mt-2 space-y-1 text-[13px]">
            <div className="flex justify-between gap-2">
              <dt className="text-[#6B7280]">Bank</dt>
              <dd className="font-bold">{account.payout_bank_name}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[#6B7280]">Account name</dt>
              <dd className="font-bold">{account.payout_account_name}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[#6B7280]">Account number</dt>
              <dd className="font-extrabold tracking-wide">{account.payout_account_number}</dd>
            </div>
          </dl>
          <Button
            type="button"
            variant="outline"
            className="mt-2 min-h-10 w-full rounded-xl"
            onClick={() => {
              void navigator.clipboard.writeText(account.payout_account_number ?? "");
              toast.success("Account number copied");
            }}
          >
            Copy account number
          </Button>
        </>
      ) : (
        <p className="mt-1 text-[12px] text-[#6B7280]">Ask the shop for their transfer details.</p>
      )}
      <Button
        type="button"
        className="mt-2 min-h-11 w-full rounded-xl bg-[#1F7A4D] font-bold text-white hover:bg-[#1F7A4D]/90"
        disabled={busy || markedPaid}
        onClick={() => void sayPaid()}
      >
        {markedPaid ? "Paid — waiting for shop" : busy ? "Sending…" : "I have paid"}
      </Button>
    </div>
  );
}

function OwnerSoldActions({ video }: { video: PublicFeedVideo }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<"paid" | "release" | null>(null);
  const markedPaid = Boolean(video.bid_buyer_marked_paid_at);

  async function run(kind: "paid" | "release") {
    setBusy(kind);
    const r = kind === "paid" ? await confirmBidPayment(video.id) : await releaseBidUnpaid(video.id);
    setBusy(null);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    haptic("success");
    toast.success(kind === "paid" ? "Sale confirmed." : "Item is back on the market.");
    await queryClient.invalidateQueries({ queryKey: ["video-feed"] });
    await queryClient.invalidateQueries({ queryKey: ["marketplace-products"] });
  }

  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      <Button
        type="button"
        className="min-h-10 rounded-xl bg-[#1F7A4D] text-xs font-extrabold text-white hover:bg-[#1F7A4D]/90"
        disabled={busy != null}
        onClick={() => void run("paid")}
      >
        {busy === "paid" ? "Saving…" : markedPaid ? "Confirm payment" : "Mark paid"}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="min-h-10 rounded-xl text-xs font-extrabold"
        disabled={busy != null}
        onClick={() => void run("release")}
      >
        {busy === "release" ? "Working…" : "Not paid — relist"}
      </Button>
    </div>
  );
}

const VideoSlide = memo(function VideoSlide({
  video,
  active,
  paused,
  mounted,
  preload,
  eagerPreload,
  products,
  liked,
  following,
}: {
  video: PublicFeedVideo;
  active: boolean;
  paused: boolean;
  mounted: boolean;
  preload: boolean;
  eagerPreload: boolean;
  products: PublicProduct[];
  liked: boolean;
  saved?: boolean;
  following: boolean;
}) {
  const actions = useFeedActions();
  const ref = useRef<HTMLVideoElement>(null);
  const src = resolveVideoSrc(video);
  const poster = resolveCoverSrc(video.cover_path) ?? undefined;
  const image = isImagePost(video);

  useEffect(() => {
    const el = ref.current;
    if (!el || image) return;
    el.muted = true;
    el.defaultMuted = true;
    el.playsInline = true;
    el.loop = true;
    if (active && !paused) {
      const play = () => {
        const attempt = el.play();
        if (attempt) void attempt.catch(() => {
          el.muted = true;
          void el.play().catch(() => undefined);
        });
      };
      if (el.readyState >= 2) play();
      else el.addEventListener("canplay", play, { once: true });
      return () => el.removeEventListener("canplay", play);
    }
    el.pause();
  }, [active, paused, image, src, mounted]);

  const { t } = useTranslation();
  const featured = products[0] ?? null;
  const when = timeAgo(video.published_at ?? video.created_at);
  const place = video.category_name;
  const [burst, setBurst] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const onMediaTap = useDoubleTap(
    () => {
      setBurst(true);
      window.setTimeout(() => setBurst(false), 650);
      actions.onLike(video);
    },
    image ? undefined : actions.onTogglePause,
  );

  const likes = video.like_count;
  const gallery = resolvePostGallery(video, products);
  const shares = Number(video.share_count ?? 0);
  const shopName = displayShopName(video.business_name);
  const shareUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/shop?v=${video.id}`;
  const shareText = video.caption?.trim() || `${shopName} on TIJAR`;

  return (
    <article
      data-video-id={video.id}
      style={SLIDE_STYLE}
      className="w-full shrink-0 border-b border-border bg-white pb-3"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <Link
          to="/b/$slug"
          params={{ slug: shopLinkSlug(video.slug, video.business_id) }}
          className="flex min-w-0 flex-1 items-center gap-2"
        >
          <SellerAvatar video={video} />
          <SellerMeta name={displayShopName(video.business_name)} verified={video.is_verified} when={when} place={place} />
        </Link>
        <button
          type="button"
          onClick={() => actions.onFollowShop(video.business_id, video.business_name)}
          className={cn(
            "inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-extrabold",
            following ? "border border-border bg-white text-foreground" : "bg-primary text-white",
          )}
        >
          {following ? t("shop.feed.followingBtn") : t("shop.feed.follow")}
        </button>
        <button
          type="button"
          onClick={() => actions.onMore(video.id)}
          aria-label={t("shop.feed.more")}
          className="flex size-11 min-h-11 min-w-11 shrink-0 items-center justify-center text-muted-foreground"
        >
          <MoreHorizontal className="size-5" />
        </button>
      </div>

      <div className="relative aspect-[4/5] w-full overflow-hidden bg-zinc-100 [transform:translateZ(0)]">
        {image ? (
          <MediaCarousel
            urls={gallery.length ? gallery : [poster || src].filter(Boolean)}
            eager={active || eagerPreload}
            onDoubleTap={() => {
              setBurst(true);
              window.setTimeout(() => setBurst(false), 650);
              actions.onLike(video);
            }}
          />
        ) : mounted ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            ref={ref}
            className="h-full w-full object-cover"
            src={src}
            poster={poster}
            autoPlay={active}
            muted
            playsInline
            loop
            preload={preload || active ? "auto" : "metadata"}
            onCanPlay={() => {
              if (active && !paused) void ref.current?.play().catch(() => undefined);
            }}
            onEnded={() => actions.onEnded(video.id)}
            aria-label={`Video from ${video.business_name}`}
          >
            {video.captions_url ? (
              <track kind="captions" src={video.captions_url} srcLang="en" label="Captions" default />
            ) : null}
          </video>
        ) : poster ? (
          <FeedImage src={poster} alt="" eager={false} width={480} />
        ) : (
          <div className="h-full w-full bg-zinc-200" />
        )}
        {image ? null : (
          <button
            type="button"
            className="absolute inset-0"
            aria-label={t("shop.feed.doubleTap")}
            onClick={onMediaTap}
          />
        )}
        {burst ? (
          <Heart className="pointer-events-none absolute left-1/2 top-1/2 size-16 -translate-x-1/2 -translate-y-1/2 fill-red-500 text-red-500 will-change-transform [animation:feed-heart_450ms_ease-out]" />
        ) : null}
        {!isBidPost(video) && video.price != null ? (
          <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[13px] font-extrabold text-white">
            {formatNgn(Number(video.price))}
          </span>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-1 px-2">
        <div className="flex items-center">
          <IconAction
            label={liked ? t("shop.feed.unlike") : t("shop.feed.like")}
            count={compactCount(likes)}
            onClick={() => actions.onLike(video)}
          >
            <Heart className={cn("size-5", liked ? "fill-red-500 text-red-500" : "text-foreground")} />
          </IconAction>
          <IconAction
            label={t("shop.feed.comments")}
            count={compactCount(video.comment_count)}
            onClick={() => actions.onOpenComments(video.id)}
          >
            <MessageCircle className="size-5 text-foreground" />
          </IconAction>
          <IconAction
            label={t("shop.feed.share")}
            count={compactCount(shares)}
            onClick={() => {
              haptic();
              setShareOpen(true);
            }}
          >
            <Share2 className="size-5 text-foreground" />
          </IconAction>
        </div>
        {featured ? (
          <IconAction label={t("shop.feed.addToCart")} onClick={() => actions.onAddProduct(video, featured)}>
            <ShoppingCart className="size-5 text-foreground" />
          </IconAction>
        ) : null}
      </div>

      {likes > 0 ? (
        <p className="px-3 text-[14px] font-extrabold">{compactCount(likes)} likes</p>
      ) : null}
      {video.caption ? (
        <p className="shrink-0 px-3 pb-1 text-[14px] leading-snug text-zinc-800">
          <span className="font-extrabold">{displayShopName(video.business_name)} </span>
          <CaptionText text={video.caption} />
        </p>
      ) : null}
      {video.comment_count > 0 ? (
        <button
          type="button"
          className="px-3 pb-1 text-left text-[14px] font-semibold text-muted-foreground"
          onClick={() => actions.onOpenComments(video.id)}
        >
          View all {compactCount(video.comment_count)} comments
        </button>
      ) : null}

      <div className="shrink-0 px-3 pb-3 pt-1">
        {isBidPost(video) ? (
          <BidPanel video={video} />
        ) : featured ? (
          <FeedProductCard product={featured} onAdd={() => actions.onAddProduct(video, featured)} />
        ) : (
          <button
            type="button"
            onClick={() => actions.onOpenProducts(video.id)}
            className="flex min-h-11 w-full items-center justify-center rounded-2xl border border-border text-sm font-extrabold text-primary"
          >
            {t("shop.feed.shopTheLook")}
          </button>
        )}
      </div>
      <ShareSheet
        open={shareOpen}
        onOpenChange={setShareOpen}
        title={shopName}
        text={shareText}
        url={shareUrl}
        imageUrl={poster ?? gallery[0] ?? null}
        onShared={() => actions.onRecordShare(video)}
      />
    </article>
  );
});

function SellerAvatar({ video }: { video: PublicFeedVideo }) {
  return (
    <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[color:var(--brand-navy,#001B3A)] text-sm font-extrabold text-white ring-1 ring-border">
      {video.business_logo_url ? (
        <FeedImage src={video.business_logo_url} alt="" className="size-full" eager width={96} />
      ) : (
        video.business_name.slice(0, 1)
      )}
    </span>
  );
}

function SellerMeta({
  name,
  verified,
  when,
  place,
}: {
  name: string;
  verified: boolean;
  when: string;
  place: string | null;
}) {
  const { t } = useTranslation();
  return (
    <span className="min-w-0">
      <span className="flex items-center gap-1 truncate text-[15px] font-extrabold text-foreground">
        {name}
        {verified ? <BadgeCheck className="size-4 shrink-0 fill-primary text-white" aria-label={t("shop.explore.verified")} /> : null}
      </span>
      <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
        {when || t("shop.feed.justNow")}
        {place ? (
          <>
            <span aria-hidden>·</span>
            <MapPin className="size-3 shrink-0" />
            <span className="truncate">{place}</span>
          </>
        ) : null}
      </span>
    </span>
  );
}

function FeedProductCard({ product, onAdd }: { product: PublicProduct; onAdd: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const startChat = useStartShopChat();
  const summary = variantSummary(product);
  const inStock = product.is_available !== false;
  const mock = isMockFeedId(product.id);

  const blurb =
    product.kind === "service"
      ? [serviceLabel(product), formatServiceDates(product)].filter(Boolean).join(" · ")
      : summary?.replace(/^Sizes:\s*/, "").replace(/Colour:\s*/, "") ||
        (product.description ? product.description.split(/[.!?]/)[0] : "Elegant · Durable · Timeless");

  function buyNow() {
    haptic("success");
    if (mock) {
      toast.error("This listing is not available.");
      return;
    }
    void navigate({ to: "/shop/buy", search: { productId: product.id } });
  }

  return (
    <div className="rounded-2xl border border-border bg-white p-2.5 text-zinc-900">
      <div className="flex items-center gap-3">
        <div className="size-[4.25rem] shrink-0 overflow-hidden rounded-xl bg-zinc-100">
          {product.image_url ? <FeedImage src={product.image_url} alt="" width={200} /> : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-[15px] font-extrabold leading-tight">
            <span className="truncate">{product.name}</span>
            {inStock ? (
              <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-primary">
                {t("shop.feed.new")}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-zinc-500">{blurb}</p>
          <p className="mt-1 text-lg font-black text-primary">
            {product.sale_price != null ? formatNgn(Number(product.sale_price)) : t("shop.feed.askSeller")}
          </p>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={buyNow}
          className="inline-flex min-h-11 items-center justify-center gap-0.5 rounded-full bg-primary px-3 text-xs font-extrabold text-white"
        >
          {t("shop.feed.buyNow")}
          <ChevronRight className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            haptic();
            onAdd();
          }}
          disabled={!inStock || product.sale_price == null}
          className="inline-flex min-h-11 items-center justify-center gap-1 rounded-full border border-primary px-3 text-xs font-extrabold text-primary disabled:opacity-50"
        >
          <ShoppingCart className="size-3.5" />
          {t("shop.feed.addToCart")}
        </button>
      </div>
      <button
        type="button"
        className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-full bg-muted text-xs font-extrabold text-foreground"
        onClick={() =>
          void startChat({
            businessId: product.business_id,
            businessName: product.business_name,
            logoUrl: product.business_logo_url,
            businessSlug: product.business_slug,
            productId: mock ? null : product.id,
          })
        }
      >
        <MessageCircle className="size-3.5" />
        Message shop
      </button>
    </div>
  );
}

const PlaceOrderSlide = memo(function PlaceOrderSlide({
  listing,
  following,
}: {
  listing: PlaceOrderListing;
  following: boolean;
}) {
  const actions = useFeedActions();
  const { t } = useTranslation();
  const slug = shopLinkSlug(listing.shop_slug, listing.business_id);
  const soldOut = placeOrderSoldOut(listing);
  const remaining = placeOrderRemaining(listing);
  return (
    <article
      data-video-id={`place-order:${listing.id}`}
      style={SLIDE_STYLE}
      className="w-full shrink-0 border-b border-border bg-white pb-3"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <Link to="/b/$slug" params={{ slug }} className="flex min-w-0 flex-1 items-center gap-2">
          <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[color:var(--brand-navy,#001B3A)] text-sm font-extrabold text-white">
            {listing.shop_logo ? (
              <FeedImage src={listing.shop_logo} alt="" eager width={96} />
            ) : (
              listing.shop_name.slice(0, 1)
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-extrabold text-foreground">{listing.shop_name}</span>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              Place your order · {dayLabel(listing.available_on)}
              {listing.location_label ? (
                <>
                  <span aria-hidden>·</span>
                  <MapPin className="size-3" />
                  {listing.location_label}
                </>
              ) : null}
            </span>
          </span>
        </Link>
        <button
          type="button"
          onClick={() => actions.onFollowShop(listing.business_id, listing.shop_name)}
          className={cn(
            "inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-extrabold",
            following ? "border border-border bg-white text-foreground" : "bg-primary text-white",
          )}
        >
          {following ? t("shop.feed.followingBtn") : t("shop.feed.follow")}
        </button>
      </div>
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-zinc-100">
        <MediaCarousel
          urls={listing.image_urls}
          eager
          empty={
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <UtensilsCrossed className="size-16" />
            </div>
          }
        />
      </div>
      <p className="px-3 pt-2 text-[15px] font-extrabold text-foreground">{listing.title}</p>
      {listing.details ? <p className="line-clamp-2 px-3 pt-1 text-[14px] text-zinc-800">{listing.details}</p> : null}
      <p className="px-3 pt-1 text-[12px] font-semibold text-muted-foreground">
        {categoryLabel(listing.category)}
        {listing.pickup_enabled ? " · Pickup" : ""}
        {listing.delivery_enabled ? " · Delivery" : ""}
      </p>
      <p className="flex items-center gap-2 px-3 pt-1">
        <span className="text-lg font-black text-primary">{formatNgn(listing.price)}</span>
        {soldOut ? (
          <span className="inline-flex rounded-full bg-[#0B1F4D] px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
            Sold out
          </span>
        ) : remaining != null ? (
          <span className="text-[12px] font-bold text-primary">{remaining} left</span>
        ) : null}
      </p>
      <div className="px-3 pb-3 pt-2">
        {soldOut ? (
          <button
            type="button"
            disabled
            className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#0B1F4D]/60 text-sm font-extrabold text-white"
          >
            Sold out
          </button>
        ) : (
          <Link
            to="/shop/order-now/$listingId"
            params={{ listingId: listing.id }}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-primary text-sm font-extrabold text-white"
          >
            Place your order
          </Link>
        )}
      </div>
    </article>
  );
});

const ListingSlide = memo(function ListingSlide({
  product,
  following,
}: {
  product: PublicProduct;
  following: boolean;
}) {
  const actions = useFeedActions();
  const { t } = useTranslation();
  const poster = product.image_url || product.extra_image_urls?.[0] || "";
  const gallery = productGallery(product);
  const slug = shopLinkSlug(product.business_slug, product.business_id);
  const shop = displayShopName(product.business_name);
  const place = product.business_public_location_label ?? product.business_location_text ?? null;
  return (
    <article
      data-video-id={`listing:${product.id}`}
      style={SLIDE_STYLE}
      className="w-full shrink-0 border-b border-border bg-white pb-3"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <Link to="/b/$slug" params={{ slug }} className="flex min-w-0 flex-1 items-center gap-2">
          <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[color:var(--brand-navy,#001B3A)] text-sm font-extrabold text-white">
            {product.business_logo_url ? (
              <FeedImage src={product.business_logo_url} alt="" eager width={96} />
            ) : (
              shop.slice(0, 1)
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-extrabold text-foreground">{shop}</span>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              {timeAgo(product.created_at) || "Just listed"}
              {place ? (
                <>
                  <span aria-hidden>·</span>
                  <MapPin className="size-3" />
                  {place}
                </>
              ) : null}
            </span>
          </span>
        </Link>
        <button
          type="button"
          onClick={() => actions.onFollowShop(product.business_id, product.business_name ?? "")}
          className={cn(
            "inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-extrabold",
            following ? "border border-border bg-white text-foreground" : "bg-primary text-white",
          )}
        >
          {following ? t("shop.feed.followingBtn") : t("shop.feed.follow")}
        </button>
      </div>
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-zinc-100">
        <MediaCarousel
          urls={gallery.length ? gallery : poster ? [poster] : []}
          eager
          empty={
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <ShoppingBag className="size-16" />
            </div>
          }
        />
      </div>
      {product.description ? (
        <p className="line-clamp-2 shrink-0 px-3 pt-2 text-[14px] text-zinc-800">{product.description}</p>
      ) : null}
      <div className="shrink-0 px-3 pt-1">
        <ProductSocialBar product={product} className="gap-1" />
      </div>
      <div className="shrink-0 px-3 pb-3 pt-2">
        <FeedProductCard product={product} onAdd={() => actions.onAddProduct(null, product)} />
      </div>
    </article>
  );
});

function IconAction({
  label,
  count,
  onClick,
  children,
}: {
  label: string;
  count?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 px-2.5 text-foreground"
      aria-label={label}
      onClick={onClick}
    >
      {children}
      {count ? <span className="text-[12px] font-bold tabular-nums">{count}</span> : null}
    </button>
  );
}

function ProductList({
  video,
  products,
  onAdded,
}: {
  video: PublicFeedVideo;
  products: PublicProduct[];
  onAdded: () => void;
}) {
  const { profile, session } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  if (products.length === 0) {
    return <p className="mt-4 text-sm text-muted-foreground">{t("shop.feed.noProducts")}</p>;
  }

  return (
    <ul className="mt-4 space-y-3">
      {products.map((product) => (
        <li key={product.id} className="flex gap-3 rounded-2xl border border-border p-3">
          <div className="size-16 overflow-hidden rounded-xl bg-muted">
            {product.image_url ? <FeedImage src={product.image_url} alt="" width={160} /> : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-extrabold">{product.name}</p>
            <p className="text-sm font-bold text-primary">
              {product.sale_price != null ? formatNgn(Number(product.sale_price)) : "No price"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {product.is_available === false ? "Unavailable" : "Available"} · live catalogue
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                className="rounded-lg"
                onClick={() => {
                  haptic("success");
                  if (isMockFeedId(product.id)) {
                    toast.error("This listing is not available.");
                    return;
                  }
                  void navigate({ to: "/shop/buy", search: { productId: product.id } });
                }}
              >
                {t("shop.feed.buyNow")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg"
                disabled={product.sale_price == null || product.is_available === false}
                onClick={async () => {
                  haptic("success");
                  ensureSavedProduct(profile?.id ?? "guest", product);
                  if (isMockFeedId(product.id)) {
                    toast.error("This listing is not available.");
                    return;
                  }
                  if (!session || !profile) {
                    toast.message("Sign in to add items to your cart.");
                    return;
                  }
                  const { error } = await addToCart(profile.id, {
                    businessId: product.business_id,
                    productId: product.id,
                    productName: product.name,
                    unit: product.unit,
                    unitPrice: Number(product.sale_price),
                    imageUrl: product.image_url,
                  });
                  if (error) toast.error(error);
                  else {
                    toast.success("Added to cart and Saved Products");
                    onAdded();
                  }
                }}
              >
                {t("shop.feed.addToCart")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg"
                onClick={async () => {
                  if (!session || !profile) {
                    void navigate({ to: "/login" });
                    return;
                  }
                  const { error } = await toggleFavoriteProduct(profile.id, product.id);
                  if (error) toast.error(error);
                  else toast.success("Saved to favourites");
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </li>
      ))}
      <li>
        <Button variant="ghost" className="w-full rounded-xl" asChild>
          <Link to="/b/$slug" params={{ slug: shopLinkSlug(video.slug, video.business_id) }}>
            Visit {displayShopName(video.business_name)}
          </Link>
        </Button>
      </li>
    </ul>
  );
}

function CommentsThread({
  videoId,
  shopName,
  onPosted,
}: {
  videoId: string;
  shopName: string;
  onPosted?: () => void;
}) {
  const { profile, session } = useAuth();
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const commentsQuery = useQuery({
    queryKey: ["video-comments", videoId],
    enabled: !isMockFeedId(videoId),
    queryFn: async () => {
      const r = await fetchVideoComments(videoId);
      if (r.error) throw new Error(r.error);
      return r.comments;
    },
  });
  const comments = commentsQuery.data ?? [];
  const roots = comments.filter((c) => !c.parent_id);
  const replyName = comments.find((c) => c.id === replyTo)?.author_name;
  const me = profile?.full_name?.trim() || "You";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ul className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {commentsQuery.isPending ? <li className="text-sm text-muted-foreground">Loading comments…</li> : null}
        {!commentsQuery.isPending && roots.length === 0 ? (
          <li className="py-10 text-center text-sm text-muted-foreground">No comments yet. Be the first.</li>
        ) : null}
        {roots.map((c) => (
          <li key={c.id}>
            <div className="flex gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#0B1F4D] text-[12px] font-extrabold text-white">
                {(c.author_name ?? "S").slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] leading-snug text-zinc-800">
                  <span className="font-extrabold">{c.author_name}</span> {c.body}
                </p>
                <div className="mt-1 flex items-center gap-3 text-[11px] font-semibold text-muted-foreground">
                  <span>{timeAgo(c.created_at) || "now"}</span>
                  <button type="button" className="font-extrabold text-[#0B1F4D]" onClick={() => setReplyTo(c.id)}>
                    Reply
                  </button>
                </div>
                <ul className="mt-3 space-y-3">
                  {comments
                    .filter((r) => r.parent_id === c.id)
                    .map((r) => (
                      <li key={r.id} className="flex gap-3">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[11px] font-extrabold text-[#0B1F4D]">
                          {(r.author_name ?? "S").slice(0, 1).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[13px] leading-snug">
                            <span className="font-extrabold">{r.author_name}</span> {r.body}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{timeAgo(r.created_at) || "now"}</p>
                        </div>
                      </li>
                    ))}
                </ul>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <form
        className="flex items-center gap-2 border-t border-border bg-white px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!session || !profile) {
            toast.message("Sign in to comment.");
            return;
          }
          const { error } = await postVideoComment({
            profileId: profile.id,
            videoId,
            body,
            parentId: replyTo,
          });
          if (error) toast.error(error);
          else {
            setBody("");
            setReplyTo(null);
            onPosted?.();
            void queryClient.invalidateQueries({ queryKey: ["video-comments", videoId] });
            void queryClient.invalidateQueries({ queryKey: ["activity-inbox"] });
          }
        }}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#1F7A4D] text-[12px] font-extrabold text-white">
          {me.slice(0, 1).toUpperCase()}
        </span>
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={replyTo ? `Reply to ${replyName ?? "comment"}…` : `Add a comment for ${shopName}…`}
          className="h-11 rounded-full border-border"
        />
        <Button
          type="submit"
          variant="ghost"
          disabled={!body.trim()}
          className="h-11 rounded-full px-3 font-extrabold text-[#1F7A4D] disabled:text-muted-foreground"
          aria-label="Post comment"
        >
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}