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
  Pencil,
  Play,
  Send,
  Share2,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  UtensilsCrossed,
  Volume2,
  VolumeX,
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
import { ShopPayPanel } from "@/features/marketplace/shop-pay-panel";
import { useAuth } from "@/features/auth/auth-context";
import { useAccountGate } from "@/features/auth/account-gate";
import { CommerceSticker } from "@/features/marketplace/commerce-sticker";
import { BusinessOfTheWeekCard } from "@/features/marketplace/business-of-the-week-card";
import { StoriesRow } from "@/features/marketplace/stories-row";
import { StoryViewer } from "@/features/marketplace/story-viewer";
import { useViewerLocation } from "@/hooks/use-viewer-location";
import { displayShopName, isBlankShopName, lookupShopProfiles, shopLinkSlug } from "@/lib/shop-names";
import { NEARBY_RADIUS_KM } from "@/lib/feed/rank-video-feed";
import {
  HOME_REFRESH_EVENT,
  bumpFeedRound,
  consumeHomeRefreshPending,
  currentFeedRound,
  currentFeedSalt,
  markHomeRefreshPending,
  orderHomeFeed,
  readSeenFeedIds,
  rememberSeenFeedIds,
  rotateFeedSalt,
} from "@/lib/feed/feed-session";
import { fetchActiveBusinessOfTheWeek, isPromotionLive } from "@/services/business-of-the-week-service";
import { fetchLiveStoryRings, type StoryRing } from "@/services/story-service";
import { formatDistance, haversineKm } from "@/utils/discover";
import { cn } from "@/lib/utils";
import { addToCart, fetchCart, fetchMarketplaceProducts, toggleFavoriteProduct } from "@/services/marketplace-service";
import { formatPricePerUnit } from "@/lib/catalogue/units";
import { formatServiceDates, serviceLabel } from "@/lib/catalogue/service-schedule";
import { parseVariantList } from "@/lib/catalogue/variants";
import { TijarLogo } from "@/components/brand-logo";
import { isTijarNativeApp } from "@/lib/tijar-native-app";
import { FeedImage } from "@/components/media/feed-image";
import { optimizedImageUrl, prefetchOptimizedImages } from "@/lib/media/optimize";
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
  deleteVideoComment,
  muteProfile,
  postVideoComment,
  updateVideoComment,
  FEED_PAGE_SIZE,
  invalidateFeedViewerSignals,
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
  type VideoComment,
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
  listingWhenLabel,
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
  deleteVideoPost,
  releaseBidUnpaid,
} from "@/services/bid-service";
import { usePrimaryBusiness } from "@/hooks/use-primary-business";

type FeedTab = "foryou" | "following" | "nearby";

const POSITION_KEY = "tijar-for-you-video-id";
const DATA_SAVER_KEY = "tijar-feed-data-saver";
const FEED_MUTE_KEY = "tijar-feed-muted";
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
  const parts = text.split(/(#[A-Za-z0-9_]+)/g);
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
  const { requireAccount } = useAccountGate();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(initialVideoId ?? null);
  const [dataSaver] = useState(() => {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem(DATA_SAVER_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [paused, setPaused] = useState(false);
  const [feedMuted, setFeedMuted] = useState(() => {
    try {
      if (typeof window === "undefined") return true;
      return window.localStorage.getItem(FEED_MUTE_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const [productsOpen, setProductsOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<PublicFeedVideo | null>(null);
  const [deleting, setDeleting] = useState(false);
  const businessQuery = usePrimaryBusiness(profile?.id);
  const [feedTab, setFeedTab] = useState<FeedTab>("foryou");
  const location = useViewerLocation(true);
  const locationRef = useRef(location);
  locationRef.current = location;
  const nearbyGeoKey =
    feedTab === "nearby" && location.coords
      ? `${location.coords.lat.toFixed(2)},${location.coords.lng.toFixed(2)}`
      : "nogeo";
  const [storyBusinessId, setStoryBusinessId] = useState<string | null>(null);
  const [feedRound, setFeedRound] = useState(() => currentFeedRound());
  const [feedSalt, setFeedSalt] = useState(() => currentFeedSalt());
  const [seenIds, setSeenIds] = useState(() => readSeenFeedIds());
  const [mockLiked, setMockLiked] = useState(() => new Set(loadUserSocial("guest").likedVideos));
  const likeBusyRef = useRef(false);
  const [mockFollowing, setMockFollowing] = useState(() => new Set(listFollowedShopIds("guest")));
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = profile?.id ?? "guest";
    setMockFollowing(new Set(listFollowedShopIds(id)));
    setMockLiked(new Set(loadUserSocial(id).likedVideos));
  }, [profile?.id]);

  const feedQuery = useInfiniteQuery({
    queryKey: [
      "video-feed",
      profile?.id ?? "anon",
      feedTab,
      nearbyGeoKey,
      feedRound,
      feedSalt,
    ],
    queryFn: async ({ pageParam }) => {
      const here = locationRef.current.coords;
      const r = await rankAndLoadFeed(profile?.id ?? null, {
        limit: FEED_PAGE_SIZE,
        before: pageParam,
        viewerLat: here?.lat ?? null,
        viewerLng: here?.lng ?? null,
        nearbyOnly: feedTab === "nearby",
        offset: 0,
        shuffleSalt: feedSalt,
        seenVideoIds: [...seenIds],
      });
      if (r.error) throw new Error(r.error);
      return r;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 15_000,
    gcTime: 30 * 60_000,
    refetchOnMount: "always",
    refetchInterval: 20_000,
    placeholderData: (previous) => previous,
  });

  const listingsQuery = useQuery({
    queryKey: ["for-you-listings", feedRound],
    queryFn: async () => {
      const r = await fetchMarketplaceProducts(24);
      if (r.error) throw new Error(r.error);
      return r.data;
    },
    staleTime: 15_000,
    refetchOnMount: "always",
    refetchInterval: 20_000,
  });

  const placeOrdersQuery = useQuery({
    queryKey: ["for-you-place-orders"],
    queryFn: async () => (await fetchPlaceOrderListings({ day: "all", limit: 8 })).listings,
    staleTime: 15_000,
    refetchOnMount: "always",
    refetchInterval: 20_000,
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
  const stickToTopUntil = useRef(0);
  const stickTimer = useRef<number | null>(null);
  const knownFeedKeysRef = useRef<Set<string>>(new Set());
  const lockedFeedKeysRef = useRef<string[]>([]);
  const mixRefreshRef = useRef(false);
  const [mixNonce, setMixNonce] = useState(0);

  const productCacheId = profile?.id ?? "anon";
  const productsQuery = useQuery({
    queryKey: ["video-feed-products", productCacheId],
    enabled: productIds.length > 0,
    queryFn: async () => {
      const r = await fetchLiveProductsByIds(productIds);
      if (r.error) throw new Error(r.error);
      return r.products;
    },
    staleTime: 60_000,
  });

  const taggedProductIdKey = productIds.join("|");
  useEffect(() => {
    if (productIds.length === 0) return;
    const key = ["video-feed-products", productCacheId] as const;
    const prev = queryClient.getQueryData<PublicProduct[]>(key) ?? [];
    const have = new Set(prev.map((p) => p.id));
    const missing = productIds.filter((id) => !have.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    void fetchLiveProductsByIds(missing).then((r) => {
      if (cancelled || r.error) return;
      queryClient.setQueryData(key, (old: PublicProduct[] | undefined) => {
        const byId = new Map((old ?? []).map((p) => [p.id, p]));
        for (const product of r.products) byId.set(product.id, product);
        return [...byId.values()];
      });
    });
    return () => {
      cancelled = true;
    };
  }, [taggedProductIdKey, productCacheId, productIds, queryClient]);

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
  const botwQuery = useQuery({
    queryKey: ["business-of-the-week"],
    queryFn: async () => {
      const r = await fetchActiveBusinessOfTheWeek();
      if (r.error) throw new Error(r.error);
      return r.featured && isPromotionLive(r.featured) ? r.featured : null;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  const storiesQuery = useQuery({
    queryKey: [
      "live-stories",
      profile?.id ?? "anon",
      [...(followQuery.data ?? new Set<string>())].join(","),
    ],
    queryFn: async () => {
      const here = locationRef.current.coords;
      const r = await fetchLiveStoryRings({
        profileId: profile?.id ?? null,
        followedIds: followQuery.data ?? new Set<string>(),
        viewerLat: here?.lat ?? null,
        viewerLng: here?.lng ?? null,
      });
      if (r.error) throw new Error(r.error);
      return r.rings;
    },
    staleTime: 30_000,
  });
  const listingGeoQuery = useQuery({
    queryKey: ["listing-shop-geo", liveListings.map((p) => p.business_id).join(",")],
    enabled: feedTab === "nearby" && liveListings.length > 0,
    queryFn: () => lookupShopProfiles(liveListings.map((p) => p.business_id)),
    staleTime: 60_000,
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
    if (restoredRef.current || videos.length === 0 || !initialVideoId) return;
    if (!videos.some((v) => v.id === initialVideoId)) return;
    restoredRef.current = true;
    setActiveId(initialVideoId);
    const root = scrollerRef.current;
    const node = root?.querySelector(`[data-video-id="${initialVideoId}"]`) as HTMLElement | null;
    if (root && node) {
      root.scrollTop = node.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
    }
  }, [videos, initialVideoId]);

  useEffect(() => {
    if (activeId) {
      sessionStorage.setItem(POSITION_KEY, activeId);
      rememberSeenFeedIds([activeId]);
    }
    setPaused(false);
  }, [activeId]);

  const itemKeysRef = useRef<string[]>([]);
  const [pull, setPull] = useState(0);
  const pullStartY = useRef(0);
  const pulling = useRef(false);

  const jumpFeedToFirst = useCallback((items: FeedItem[]) => {
    const root = scrollerRef.current;
    if (root) root.scrollTop = 0;
    const first = items[0];
    if (first?.kind === "video") setActiveId(first.video.id);
    else if (first) setActiveId(null);
    restoredRef.current = true;
  }, []);

  const refreshFeed = useCallback(() => {
    consumeHomeRefreshPending();
    rememberSeenFeedIds(itemKeysRef.current);
    setSeenIds(readSeenFeedIds());
    mixRefreshRef.current = true;
    setMixNonce((n) => n + 1);
    setFeedSalt(rotateFeedSalt());
    setFeedRound(bumpFeedRound());
    restoredRef.current = false;
    stickToTopUntil.current = Date.now() + 2_400;
    if (stickTimer.current) window.clearTimeout(stickTimer.current);
    stickTimer.current = window.setTimeout(() => {
      stickToTopUntil.current = 0;
    }, 2_400);
    haptic();
    const root = scrollerRef.current;
    if (root) root.scrollTop = 0;
    void queryClient.invalidateQueries({ queryKey: ["video-feed"] });
    void queryClient.invalidateQueries({ queryKey: ["for-you-listings"] });
    void queryClient.invalidateQueries({ queryKey: ["live-stories"] });
    void queryClient.invalidateQueries({ queryKey: ["business-of-the-week"] });
    void queryClient.invalidateQueries({ queryKey: ["for-you-place-orders"] });
  }, [queryClient]);

  useEffect(() => {
    function onHomeRefresh() {
      refreshFeed();
    }
    window.addEventListener(HOME_REFRESH_EVENT, onHomeRefresh);
    return () => window.removeEventListener(HOME_REFRESH_EVENT, onHomeRefresh);
  }, [refreshFeed]);

  useEffect(() => {
    if (consumeHomeRefreshPending()) refreshFeed();
  }, [refreshFeed]);

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
    if (!activeId || activeId.includes(":") || isMockFeedId(activeId)) return;
    void recordFeedSignal(activeId, "impression");
    void recordFeedSignal(activeId, "view");
  }, [activeId]);

  const cartCount = cartQuery.data?.reduce((n, i) => n + Number(i.quantity), 0) ?? 0;

  function requireUser(): boolean {
    if (!session || !profile) {
      requireAccount("generic");
      return false;
    }
    return true;
  }

  const patchFeedStat = useCallback(
    (videoId: string, field: "like_count" | "comment_count" | "share_count", delta: number) => {
      queryClient.setQueriesData(
        { queryKey: ["video-feed", profile?.id ?? "anon"] },
        (old: { pages: Array<{ videos: PublicFeedVideo[]; nextCursor: string | null }>; pageParams: unknown[] } | undefined) => {
          if (!old?.pages) return old;
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

  const toggleFeedMute = useCallback(() => {
    setFeedMuted((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(FEED_MUTE_KEY, next ? "1" : "0");
      } catch {
        // Ignore.
      }
      haptic();
      return next;
    });
  }, []);

  const feedActions = useMemo<FeedActions>(
    () => ({
      onTogglePause: () => setPaused((p) => !p),
      onLike: (video) => {
        void (async () => {
          if (!requireUser() || !profile) return;
          if (likeBusyRef.current) return;
          likeBusyRef.current = true;
          const wasLiked = queryClient.getQueryData<Set<string>>(["video-likes", profile.id])?.has(video.id) ?? false;
          haptic();
          try {
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
              // One like per shopper: only move the counter when the state flips.
              if (liked !== wasLiked) patchFeedLike(video.id, liked);
            }
          } finally {
            likeBusyRef.current = false;
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
            invalidateFeedViewerSignals(profile.id);
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
  const featured = botwQuery.data ?? null;
  const storyRings = useMemo(() => {
    const rings = storiesQuery.data ?? [];
    if (!featured) return rings;
    const existing = rings.find((r) => r.businessId === featured.businessId);
    const ring: StoryRing = existing
      ? { ...existing, featured: true, unseen: true }
      : {
          businessId: featured.businessId,
          businessName: featured.businessName,
          logoUrl: featured.logoUrl,
          slug: featured.slug,
          isVerified: featured.isVerified,
          unseen: true,
          distanceKm: null,
          locationLabel: featured.locationLabel,
          stories: [],
          featured: true,
        };
    return [ring, ...rings.filter((r) => r.businessId !== featured.businessId)];
  }, [storiesQuery.data, featured]);
  const viewerHere = location.coords;
  const nearbyKm = (lat?: number | null, lng?: number | null) => {
    if (!viewerHere || lat == null || lng == null) return null;
    return haversineKm(viewerHere, { lat, lng });
  };
  const showPosts =
    feedTab === "following" ? videos.filter((v) => followed.has(v.business_id)) : videos;
  const showListings = (() => {
    if (feedTab === "following") return [];
    const source = feedTab === "nearby" ? liveListings : extraListings;
    if (feedTab !== "nearby") return source;
    if (viewerHere) {
      return source.filter((p) => {
        const shop = listingGeoQuery.data?.get(p.business_id);
        const km = nearbyKm(shop?.latitude ?? null, shop?.longitude ?? null);
        return km != null && km <= NEARBY_RADIUS_KM;
      });
    }
    return source.filter((p) => followed.has(p.business_id));
  })();
  const showPlaceOrders = (() => {
    if (feedTab === "following") return [];
    const source = placeOrdersQuery.data ?? [];
    if (feedTab !== "nearby") return source;
    if (viewerHere) {
      return source.filter((l) => {
        const km = nearbyKm(l.latitude, l.longitude);
        return km != null && km <= NEARBY_RADIUS_KM;
      });
    }
    return source.filter((l) => followed.has(l.business_id));
  })();
  const activeIndex = showPosts.findIndex((v) => v.id === activeId);
  const productsByVideo = useMemo(() => {
    const map = new Map<string, PublicProduct[]>();
    for (const video of showPosts) {
      map.set(video.id, productsForVideo(video, productsById, listingsByBusiness));
    }
    return map;
  }, [showPosts, productsById, listingsByBusiness]);

  // New posts go first as they arrive. A Home refresh mixes older posts unless something new just landed.
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
    const mixRefresh = mixRefreshRef.current;
    const ordered = orderHomeFeed(items, {
      salt: feedSalt,
      seen: seenIds,
      knownKeys: knownFeedKeysRef.current,
      mixRefresh,
      lockedKeys: lockedFeedKeysRef.current,
    });
    lockedFeedKeysRef.current = ordered.map((item) => item.key);
    for (const item of ordered) knownFeedKeysRef.current.add(item.key);
    mixRefreshRef.current = false;
    return ordered;
  }, [showPlaceOrders, showPosts, showListings, feedSalt, seenIds, mixNonce]);
  itemKeysRef.current = feedItems.map((item) => item.key);

  useEffect(() => {
    if (feedItems.length === 0) return;
    const refreshing = Date.now() < stickToTopUntil.current;
    const atTop = (scrollerRef.current?.scrollTop ?? 0) < 56;
    if (initialVideoId && restoredRef.current && !refreshing) return;
    if (refreshing || !restoredRef.current || atTop) jumpFeedToFirst(feedItems);
  }, [feedItems, jumpFeedToFirst, feedQuery.isFetching, listingsQuery.isFetching, placeOrdersQuery.isFetching, initialVideoId]);

  useEffect(() => {
    const urls: string[] = [];
    for (const item of feedItems.slice(0, 5)) {
      if (item.kind === "video") {
        const cover = resolveCoverSrc(item.video.cover_path);
        if (cover) urls.push(cover);
        const first = resolvePostGallery(item.video, productsByVideo.get(item.video.id) ?? [])[0];
        if (first) urls.push(first);
        if (item.video.business_logo_url) urls.push(item.video.business_logo_url);
      } else if (item.kind === "listing" && item.product.image_url) {
        urls.push(item.product.image_url);
      } else if (item.kind === "place") {
        const photo = item.listing.image_urls?.[0];
        if (photo) urls.push(photo);
      }
    }
    prefetchOptimizedImages(urls, 540);
  }, [feedItems, productsByVideo]);

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
      <div
        className={cn(
          "relative mx-auto flex min-h-0 w-full min-w-0 max-w-lg flex-1 flex-col overflow-hidden text-foreground md:max-w-xl",
          isTijarNativeApp() ? "bg-[var(--native-canvas,#F3F5F8)]" : "bg-white",
        )}
      >
        <FeedActionsContext.Provider value={feedActions}>
        <div
          ref={scrollerRef}
          style={{ WebkitOverflowScrolling: "touch" }}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y [overflow-anchor:none] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onTouchStart={(e) => {
            const top = scrollerRef.current?.scrollTop ?? 1;
            if (top <= 2) {
              pullStartY.current = e.touches[0]?.clientY ?? 0;
              pulling.current = true;
            } else {
              pullStartY.current = 0;
              pulling.current = false;
            }
          }}
          onTouchMove={(e) => {
            if (!pulling.current || (scrollerRef.current?.scrollTop ?? 0) > 2) {
              if (pull !== 0) setPull(0);
              return;
            }
            const dy = (e.touches[0]?.clientY ?? 0) - pullStartY.current;
            setPull(Math.max(0, Math.min(76, dy * 0.42)));
          }}
          onTouchEnd={() => {
            if (pull > 40) refreshFeed();
            setPull(0);
            pulling.current = false;
            pullStartY.current = 0;
          }}
        >
          <FeedTopBar tab={feedTab} onTab={setFeedTab} />
          {pull > 10 || (feedQuery.isFetching && Boolean(feedQuery.data)) ? (
            <p
              className="text-center text-[11px] font-semibold text-[#1F7A4D]"
              style={{
                height: Math.max(pull, feedQuery.isFetching && feedQuery.data ? 28 : 0),
              }}
            >
              {feedQuery.isFetching && feedQuery.data ? "Refreshing…" : "Release to refresh"}
            </p>
          ) : null}
          {feedTab === "nearby" && location.status === "denied" ? (
            <button
              type="button"
              onClick={() => location.request()}
              className="w-full bg-[#0A2540] px-4 py-2 text-left text-[12px] font-semibold text-white"
            >
              Location is off. Showing shops you follow. Tap to enable Nearby.
            </button>
          ) : null}
          {feedTab === "nearby" && location.status === "granted" && location.coords ? (
            <p className="bg-[#E8F5EE] px-4 py-1.5 text-[12px] font-semibold text-[#1F7A4D]">
              Shops within {NEARBY_RADIUS_KM} km of you
            </p>
          ) : null}
          <StoriesRow
            rings={storyRings}
            canCreate={Boolean(businessQuery.data?.business)}
            onOpen={(businessId) => {
              const ring = storyRings.find((r) => r.businessId === businessId);
              if (ring?.featured && ring.stories.length === 0 && ring.slug) {
                void navigate({ to: "/b/$slug", params: { slug: ring.slug } });
                return;
              }
              setStoryBusinessId(businessId);
            }}
          />
          {feedTab === "foryou" && featured ? (
            <BusinessOfTheWeekCard
              featured={featured}
              following={followed.has(featured.businessId) || mockFollowing.has(featured.businessId)}
              onFollow={() => feedActions.onFollowShop(featured.businessId, featured.businessName)}
            />
          ) : null}
          {feedQuery.isPending
            ? Array.from({ length: 3 }, (_, i) => <FeedSkeleton key={`sk-${i}`} />)
            : null}
          {feedItems.map((item, itemIndex) => {
            if (item.kind === "place") {
              const slideId = `place-order:${item.listing.id}`;
              const next = feedItems[itemIndex + 1];
              const nextId =
                next?.kind === "place"
                  ? `place-order:${next.listing.id}`
                  : next?.kind === "listing"
                    ? `listing:${next.product.id}`
                    : next?.kind === "video"
                      ? next.video.id
                      : null;
              const eager = activeId === slideId || activeId === nextId;
              return (
                <PlaceOrderSlide
                  key={item.key}
                  listing={item.listing}
                  following={
                    followQuery.data?.has(item.listing.business_id) ||
                    mockFollowing.has(item.listing.business_id)
                  }
                  eager={eager}
                />
              );
            }
            if (item.kind === "listing") {
              const slideId = `listing:${item.product.id}`;
              const next = feedItems[itemIndex + 1];
              const nextId =
                next?.kind === "place"
                  ? `place-order:${next.listing.id}`
                  : next?.kind === "listing"
                    ? `listing:${next.product.id}`
                    : next?.kind === "video"
                      ? next.video.id
                      : null;
              const eager = activeId === slideId || activeId === nextId;
              return (
                <ListingSlide
                  key={item.key}
                  product={item.product}
                  following={
                    followQuery.data?.has(item.product.business_id) ||
                    mockFollowing.has(item.product.business_id)
                  }
                  eager={eager}
                />
              );
            }
            const video = item.video;
            const videoIndex = videoIndexById.get(video.id) ?? 0;
            const idx = activeIndex < 0 ? 0 : activeIndex;
            const isActive = activeId === video.id;
            const isNext = videoIndex === idx + 1;
            const mountMedia = isActive || (!dataSaver && isNext);
            return (
              <VideoSlide
                key={item.key}
                video={video}
                active={isActive}
                paused={paused}
                muted={feedMuted}
                onToggleMute={toggleFeedMute}
                mounted={mountMedia}
                preload={isActive}
                eagerPreload={false}
                products={productsByVideo.get(video.id) ?? EMPTY_PRODUCTS}
                liked={likedQuery.data?.has(video.id) ?? mockLiked.has(video.id)}
                saved={savedQuery.data?.has(video.id) ?? false}
                following={followQuery.data?.has(video.business_id) || mockFollowing.has(video.business_id)}
              />
            );
          })}
          {feedQuery.isPending ? null : showPosts.length === 0 && showListings.length === 0 && showPlaceOrders.length === 0 ? (
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-8 text-center">
              <ShoppingBag className="size-10 text-primary/40" />
              <p className="font-extrabold text-foreground">
                {feedTab === "following" ? "Follow a shop to see their posts" : "Nothing live yet"}
              </p>
              <p className="text-sm text-muted-foreground">
                {feedTab === "nearby"
                  ? location.status === "denied"
                    ? "Turn on location to see shops around you, or follow shops you already know."
                    : "No live posts within 15 km yet. Follow shops or open the map."
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
              onDeleted={() => patchFeedStat(active.id, "comment_count", -1)}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>{active && businessQuery.data?.business?.id === active.business_id ? "Your post" : "Safety"}</SheetTitle>
          </SheetHeader>
          {active ? (
            <div className="mt-4 grid gap-2">
              {businessQuery.data?.business?.id === active.business_id ? (
                <>
                  <Link
                    to="/shop/post/$postId/edit"
                    params={{ postId: active.id }}
                    onClick={() => setMoreOpen(false)}
                    className="flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-semibold"
                  >
                    <Pencil className="mr-2 size-4" /> Edit post
                  </Link>
                  <Button
                    variant="outline"
                    className="justify-start rounded-xl"
                    onClick={() => {
                      setShareTarget(active);
                      setMoreOpen(false);
                    }}
                  >
                    <Share2 className="mr-2 size-4" /> Share post
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start rounded-xl text-destructive"
                    disabled={deleting}
                    onClick={async () => {
                      if (!window.confirm("Delete this post? Customers will no longer see it.")) return;
                      setDeleting(true);
                      const r = await deleteVideoPost(active.id);
                      setDeleting(false);
                      if (r.error) {
                        toast.error(r.error);
                        return;
                      }
                      toast.success("Post deleted.");
                      setMoreOpen(false);
                      void queryClient.invalidateQueries({ queryKey: ["video-feed"] });
                      void queryClient.invalidateQueries({ queryKey: ["seller-videos"] });
                      void queryClient.invalidateQueries({ queryKey: ["own-profile-posts"] });
                      void queryClient.invalidateQueries({ queryKey: ["products-dashboard"] });
                    }}
                  >
                    <Trash2 className="mr-2 size-4" /> {deleting ? "Deleting…" : "Delete post"}
                  </Button>
                  <div className="my-1 h-px bg-border" />
                </>
              ) : null}
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
                  invalidateFeedViewerSignals(profile.id);
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
                  invalidateFeedViewerSignals(profile.id);
                  void queryClient.invalidateQueries({ queryKey: ["video-feed"] });
                }}
              >
                Block account
              </Button>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {storyBusinessId ? (
        <StoryViewer
          rings={storyRings.filter((ring) => ring.stories.length > 0)}
          startBusinessId={storyBusinessId}
          profileId={profile?.id ?? null}
          ownerBusinessId={businessQuery.data?.business?.id ?? null}
          onClose={() => {
            setStoryBusinessId(null);
            void queryClient.invalidateQueries({ queryKey: ["live-stories"] });
          }}
        />
      ) : null}

      <ShareSheet
        open={Boolean(shareTarget)}
        onOpenChange={(open) => {
          if (!open) setShareTarget(null);
        }}
        title={shareTarget ? displayShopName(shareTarget.business_name) : ""}
        text={shareTarget?.caption?.trim() || "New on TIJAR"}
        url={
          shareTarget
            ? `${typeof window !== "undefined" ? window.location.origin : ""}${
                shareTarget.post_type === "bid" ? `/shop/bid/${shareTarget.id}` : `/shop?v=${shareTarget.id}`
              }`
            : ""
        }
        imageUrl={shareTarget ? resolveCoverSrc(shareTarget.cover_path) ?? resolveVideoSrc(shareTarget) : null}
        mediaKind={shareTarget && isImagePost(shareTarget) ? "image" : "video"}
        productId={shareTarget?.product_ids?.[0] ?? null}
        price={shareTarget?.price ?? null}
      />
    </MarketplaceShell>
  );
}

function FeedTopBar({ tab, onTab }: { tab: FeedTab; onTab: (t: FeedTab) => void }) {
  const { profile } = useAuth();
  const { requireAccount } = useAccountGate();
  const { t } = useTranslation();
  const unreadQuery = useQuery({
    queryKey: ["activity-inbox", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      const { fetchActivityNotifications } = await import("@/services/social-service");
      try {
        const r = await fetchActivityNotifications(profile!.id);
        if (r.error) return { items: [], unread: 0 };
        return r;
      } catch {
        return { items: [], unread: 0 };
      }
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

  const nativeApp = isTijarNativeApp();

  return (
    <header
      className={cn(
        "pt-[max(0.4rem,env(safe-area-inset-top))]",
        nativeApp ? "native-feed-header border-0 bg-transparent" : "border-b border-border bg-white",
      )}
    >
      <div className="flex min-h-12 items-center gap-1 px-3 py-1.5">
        <Link
          to="/shop"
          className="flex min-w-0 flex-1 flex-col justify-center"
          onClick={(event) => {
            event.preventDefault();
            markHomeRefreshPending();
            window.dispatchEvent(new Event(HOME_REFRESH_EVENT));
          }}
        >
          <TijarLogo compact className={cn("object-left", nativeApp ? "h-7 max-w-[128px]" : "h-8 max-w-[148px]")} />
          {nativeApp ? null : (
            <p className="mt-0.5 text-[9px] font-extrabold uppercase tracking-[0.16em] text-primary">
              {t("shop.feed.brand")}
            </p>
          )}
        </Link>
        {nativeApp ? (
          <Link
            to="/shop/browse"
            aria-label={t("shop.nav.shop")}
            className="flex size-10 items-center justify-center rounded-full bg-white/90 text-foreground shadow-[0_4px_14px_rgba(11,31,58,0.08)]"
          >
            <ShoppingBag className="size-[18px]" />
          </Link>
        ) : (
          <AppLanguageButton />
        )}
        <Link
          to="/shop/favorites"
          aria-label={t("shop.feed.saved")}
          className={cn(
            "flex items-center justify-center text-foreground",
            nativeApp
              ? "size-10 rounded-full bg-white/90 shadow-[0_4px_14px_rgba(11,31,58,0.08)]"
              : "size-11 min-h-11 min-w-11",
          )}
        >
          <Heart className="size-5" />
        </Link>
        <Link
          to="/shop/notifications"
          aria-label={t("shop.feed.notifications")}
          className={cn(
            "relative flex items-center justify-center text-foreground",
            nativeApp
              ? "size-10 rounded-full bg-white/90 shadow-[0_4px_14px_rgba(11,31,58,0.08)]"
              : "size-11 min-h-11 min-w-11",
          )}
        >
          <Bell className="size-5" />
          {unread > 0 ? (
            <span className="absolute right-1.5 top-1.5 min-w-4 rounded-full bg-primary px-1 text-center text-[9px] font-extrabold leading-4 text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Link>
        {nativeApp ? null : (
          <Link
            to="/shop/profile"
            onClick={(event) => {
              if (!requireAccount("profile")) event.preventDefault();
            }}
            aria-label={t("shop.feed.profile")}
            className="flex size-9 min-h-9 min-w-9 items-center justify-center overflow-hidden rounded-full bg-[color:var(--brand-navy,#001B3A)] text-[10px] font-bold text-white"
          >
            {profile?.avatar_url ? (
              <FeedImage src={profile.avatar_url} alt="" eager width={72} />
            ) : (
              initials || "?"
            )}
          </Link>
        )}
      </div>
      <nav
        className={cn("grid grid-cols-3", nativeApp && "native-feed-tabs mx-3 mb-2")}
        aria-label="Feed"
      >
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
                nativeApp && "min-h-9 rounded-full text-[12px]",
                active ? "font-extrabold text-primary" : "font-semibold text-muted-foreground",
                nativeApp && active && "bg-white text-[#0B1F3A] shadow-[0_4px_12px_rgba(11,31,58,0.08)]",
              )}
            >
              {item.label}
              {!nativeApp && active ? <span className="absolute inset-x-8 bottom-0 h-[3px] rounded-full bg-primary" /> : null}
            </button>
          );
        })}
      </nav>
    </header>
  );
}

const BidPanel = memo(function BidPanel({ video }: { video: PublicFeedVideo }) {
  const { profile } = useAuth();
  const businessQuery = usePrimaryBusiness(profile?.id);
  const phase = bidPhase(video);
  const isOwner = Boolean(profile?.id && businessQuery.data?.business?.id === video.business_id);
  const isWinner = Boolean(profile?.id && video.bid_winner_id === profile.id);

  const starting = video.bid_starting_price != null ? Number(video.bid_starting_price) : 0;
  const limit = video.bid_sale_limit != null ? Number(video.bid_sale_limit) : null;
  const topBid = video.top_bid != null ? Number(video.top_bid) : null;

  const endsIn = useSecondsTo(video.bid_ends_at);
  const startsIn = useSecondsTo(video.bid_starts_at);
  const payIn = useSecondsTo(bidPaymentSecondsLeft(video) > 0 ? video.bid_payment_due_at : null);

  const chip =
    phase === "paid"
      ? { label: "Paid", cls: "bg-[#1F7A4D] text-white" }
      : phase === "sold"
        ? { label: "Sold", cls: "bg-[#0B1F4D] text-white" }
        : phase === "paused"
          ? { label: "Stopped", cls: "bg-amber-500 text-white" }
          : phase === "upcoming"
            ? { label: "Starts soon", cls: "bg-[#EEF1F5] text-[#0B1F4D]" }
            : phase === "ended" || phase === "closed"
              ? { label: phase === "closed" ? "Closed" : "Ended", cls: "bg-[#EEF1F5] text-[#6B7280]" }
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

      <Link
        to="/shop/bid/$postId"
        params={{ postId: video.id }}
        className={cn(
          "mt-3 flex min-h-11 items-center justify-center rounded-xl text-sm font-extrabold",
          phase === "open" && !isOwner
            ? "bg-[#1F7A4D] text-white hover:bg-[#1F7A4D]/90"
            : "border border-[#E5E7EB] bg-white text-[#0B1F4D]",
        )}
      >
        {isOwner ? "Open control room" : phase === "open" ? "Place a bid" : "View bids & details"}
      </Link>

      {phase === "upcoming" ? (
        <p className="mt-2 rounded-xl bg-white px-3 py-2 text-center text-[13px] font-bold text-[#6B7280]">
          Bidding opens soon
        </p>
      ) : null}

      {phase === "ended" || phase === "closed" ? (
        <p className="mt-2 rounded-xl bg-white px-3 py-2 text-center text-[13px] font-bold text-[#6B7280]">
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
  const markedPaid = Boolean(video.bid_buyer_marked_paid_at);
  if (markedPaid || video.bid_status === "paid") {
    return (
      <p className="mt-3 rounded-xl bg-[#1F7A4D]/10 px-3 py-3 text-center text-[13px] font-extrabold text-[#1F7A4D]">
        Paid
      </p>
    );
  }
  return (
    <ShopPayPanel
      businessId={video.business_id}
      amount={Number(video.top_bid ?? video.bid_starting_price ?? video.price ?? 0)}
      orderId={video.id}
      kind="bid"
      itemLabel={video.caption?.trim() || "winning bid"}
      onPaid={() => {
        void queryClient.invalidateQueries({ queryKey: ["video-feed"] });
      }}
    />
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
  muted,
  onToggleMute,
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
  muted: boolean;
  onToggleMute: () => void;
  mounted: boolean;
  preload: boolean;
  eagerPreload: boolean;
  products: PublicProduct[];
  liked: boolean;
  saved?: boolean;
  following: boolean;
}) {
  const actions = useFeedActions();
  const navigate = useNavigate();
  const ref = useRef<HTMLVideoElement>(null);
  const src = resolveVideoSrc(video);
  const poster = resolveCoverSrc(video.cover_path) ?? undefined;
  const image = isImagePost(video);

  useEffect(() => {
    const el = ref.current;
    if (!el || image) return;
    el.muted = muted;
    el.defaultMuted = muted;
    el.volume = 1;
    el.playsInline = true;
    el.loop = true;
    if (active && !paused) {
      const play = () => {
        el.muted = muted;
        const attempt = el.play();
        if (attempt)
          void attempt.catch(() => {
            if (!el.muted) {
              el.muted = true;
              void el.play().catch(() => undefined);
            }
          });
      };
      if (el.readyState >= 2) play();
      else el.addEventListener("canplay", play, { once: true });
      return () => el.removeEventListener("canplay", play);
    }
    el.pause();
  }, [active, paused, muted, image, src, mounted]);

  const { t } = useTranslation();
  const featured = products[0] ?? null;
  const when = timeAgo(video.published_at ?? video.created_at);
  const place = [
    video.distance_km != null ? formatDistance(video.distance_km) : null,
    video.public_location_label ?? video.location_text,
  ]
    .filter(Boolean)
    .join(" · ");
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
      className="w-full shrink-0 border-b border-border bg-white pb-3" data-feed-post=""
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <FeedShopAvatar
          name={shopName}
          src={video.business_logo_url}
          slug={shopLinkSlug(video.slug, video.business_id)}
        />
        <Link
          to="/b/$slug"
          params={{ slug: shopLinkSlug(video.slug, video.business_id) }}
          className="min-w-0 flex-1"
        >
          <SellerMeta name={shopName} verified={video.is_verified} when={when} place={place} />
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
            src={active || preload ? src : undefined}
            poster={poster ? optimizedImageUrl(poster, 540) : undefined}
            autoPlay={active && !paused}
            muted={muted}
            playsInline
            loop
            preload={active ? "auto" : "metadata"}
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
          <>
            <button
              type="button"
              className="absolute inset-0 z-[1]"
              aria-label={paused ? t("shop.feed.play") : t("shop.feed.pause")}
              onClick={onMediaTap}
            />
            {paused && active ? (
              <span className="pointer-events-none absolute left-1/2 top-1/2 z-[2] flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/45">
                <Play className="size-8 fill-white text-white" />
              </span>
            ) : null}
            <button
              type="button"
              className="absolute bottom-3 right-3 z-[3] flex size-11 items-center justify-center rounded-full bg-black/55 text-white"
              aria-label={muted ? t("shop.feed.unmute") : t("shop.feed.mute")}
              onClick={(e) => {
                e.stopPropagation();
                onToggleMute();
              }}
            >
              {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
            </button>
          </>
        )}
        {burst ? (
          <Heart className="pointer-events-none absolute left-1/2 top-1/2 z-[2] size-16 -translate-x-1/2 -translate-y-1/2 fill-red-500 text-red-500 will-change-transform [animation:feed-heart_450ms_ease-out]" />
        ) : null}
        {featured || (!isBidPost(video) && video.price != null) ? (
          <div
            className="absolute bottom-3 left-3 z-[4]"
            onClick={(e) => e.stopPropagation()}
          >
            <CommerceSticker
              title={featured?.name || video.caption?.trim() || shopName}
              imageUrl={featured?.image_url ?? poster ?? null}
              price={featured?.sale_price != null ? Number(featured.sale_price) : video.price ?? null}
              unit={featured?.unit}
              host="tijar.ng"
              onPay={() => {
                if (featured) {
                  void navigate({ to: "/shop/buy", search: { productId: featured.id } });
                  return;
                }
                void navigate({ to: "/b/$slug", params: { slug: shopLinkSlug(video.slug, video.business_id) } });
              }}
            />
          </div>
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
        mediaKind={image ? "image" : "video"}
        productId={featured?.id ?? video.product_ids?.[0] ?? null}
        price={featured?.sale_price != null ? Number(featured.sale_price) : video.price ?? null}
        onShared={() => actions.onRecordShare(video)}
      />
    </article>
  );
});

function FeedShopAvatar({
  name,
  src,
  slug,
}: {
  name: string;
  src?: string | null;
  slug: string;
}) {
  const photo = Boolean(src);
  const initial = (name.trim().slice(0, 1) || "S").toUpperCase();
  return (
    <Link
      to="/b/$slug"
      params={{ slug }}
      aria-label={name}
      className="relative shrink-0 rounded-full bg-gradient-to-tr from-[#1F7A4D] via-[#00B86B] to-[#0B1F4D] p-[2px]"
    >
      <span className="flex size-11 items-center justify-center overflow-hidden rounded-full bg-[#0B1F4D] text-sm font-extrabold text-white ring-2 ring-white">
        {photo ? (
          <FeedImage src={src!} alt="" eager width={88} className="size-full object-cover" />
        ) : (
          initial
        )}
      </span>
    </Link>
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
            {product.sale_price != null
              ? formatPricePerUnit(Number(product.sale_price), product.unit, formatNgn)
              : t("shop.feed.askSeller")}
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
  eager = false,
}: {
  listing: PlaceOrderListing;
  following: boolean;
  eager?: boolean;
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
      className="w-full shrink-0 border-b border-border bg-white pb-3" data-feed-post=""
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <FeedShopAvatar name={listing.shop_name} src={listing.shop_logo} slug={slug} />
        <Link to="/b/$slug" params={{ slug }} className="min-w-0 flex-1">
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-extrabold text-foreground">{listing.shop_name}</span>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              Place your order · {listingWhenLabel(listing)}
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
          eager={eager}
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
  eager = false,
}: {
  product: PublicProduct;
  following: boolean;
  eager?: boolean;
}) {
  const actions = useFeedActions();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const poster = product.image_url || product.extra_image_urls?.[0] || "";
  const gallery = productGallery(product);
  const slug = shopLinkSlug(product.business_slug, product.business_id);
  const shop = displayShopName(product.business_name);
  const place = product.business_public_location_label ?? product.business_location_text ?? null;
  return (
    <article
      data-video-id={`listing:${product.id}`}
      style={SLIDE_STYLE}
      className="w-full shrink-0 border-b border-border bg-white pb-3" data-feed-post=""
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <FeedShopAvatar name={shop} src={product.business_logo_url} slug={slug} />
        <Link to="/b/$slug" params={{ slug }} className="min-w-0 flex-1">
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
          eager={eager}
          empty={
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <ShoppingBag className="size-16" />
            </div>
          }
        />
        <div className="absolute bottom-3 left-3 z-[4]">
          <CommerceSticker
            title={product.name}
            imageUrl={product.image_url}
            price={product.sale_price != null ? Number(product.sale_price) : null}
            unit={product.unit}
            onPay={() => void navigate({ to: "/shop/buy", search: { productId: product.id } })}
          />
        </div>
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
  const { profile } = useAuth();
  const { requireAccount } = useAccountGate();
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
              {product.sale_price != null ? formatPricePerUnit(Number(product.sale_price), product.unit, formatNgn) : "No price"}
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
                  if (!requireAccount("cart") || !profile) {
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
                  if (!requireAccount("generic") || !profile) {
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
  onDeleted,
}: {
  videoId: string;
  shopName: string;
  onPosted?: () => void;
  onDeleted?: () => void;
}) {
  const { profile } = useAuth();
  const { requireAccount } = useAccountGate();
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
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

  function startEdit(commentId: string, current: string) {
    setEditingId(commentId);
    setEditBody(current);
  }

  async function saveEdit() {
    if (!editingId || !profile) return;
    const text = editBody.trim();
    if (!text) return;
    const { error } = await updateVideoComment({ commentId: editingId, profileId: profile.id, body: text });
    if (error) {
      toast.error(error);
      return;
    }
    setEditingId(null);
    setEditBody("");
    void queryClient.invalidateQueries({ queryKey: ["video-comments", videoId] });
  }

  async function remove(commentId: string) {
    if (!profile) return;
    if (typeof window !== "undefined" && !window.confirm("Delete this comment?")) return;
    const { error } = await deleteVideoComment({ commentId, profileId: profile.id });
    if (error) {
      toast.error(error);
      return;
    }
    onDeleted?.();
    void queryClient.invalidateQueries({ queryKey: ["video-comments", videoId] });
    void queryClient.invalidateQueries({ queryKey: ["activity-inbox"] });
  }

  function renderBody(comment: VideoComment, small = false) {
    if (editingId === comment.id) {
      return (
        <div className="mt-1 flex items-center gap-2">
          <Input
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            className="h-9 rounded-full border-border text-[13px]"
            autoFocus
          />
          <Button
            type="button"
            size="sm"
            className="h-9 rounded-full px-3 text-[12px] font-extrabold"
            disabled={!editBody.trim()}
            onClick={() => void saveEdit()}
          >
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-9 rounded-full px-2 text-[12px] font-semibold"
            onClick={() => {
              setEditingId(null);
              setEditBody("");
            }}
          >
            Cancel
          </Button>
        </div>
      );
    }
    return (
      <p className={cn("leading-snug", small ? "text-[13px]" : "text-[14px] text-zinc-800")}>
        <span className="font-extrabold">{comment.author_name}</span> {comment.body}
      </p>
    );
  }

  function renderActions(comment: VideoComment, allowReply: boolean) {
    const mine = Boolean(profile && comment.profile_id === profile.id);
    return (
      <div className="mt-1 flex items-center gap-3 text-[11px] font-semibold text-muted-foreground">
        <span>{timeAgo(comment.created_at) || "now"}</span>
        {allowReply ? (
          <button type="button" className="font-extrabold text-[#0B1F4D]" onClick={() => setReplyTo(comment.id)}>
            Reply
          </button>
        ) : null}
        {mine ? (
          <>
            <button
              type="button"
              className="font-extrabold text-[#0B1F4D]"
              onClick={() => startEdit(comment.id, comment.body)}
            >
              Edit
            </button>
            <button type="button" className="font-extrabold text-destructive" onClick={() => void remove(comment.id)}>
              Delete
            </button>
          </>
        ) : null}
      </div>
    );
  }

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
                {renderBody(c)}
                {renderActions(c, true)}
                <ul className="mt-3 space-y-3">
                  {comments
                    .filter((r) => r.parent_id === c.id)
                    .map((r) => (
                      <li key={r.id} className="flex gap-3">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[11px] font-extrabold text-[#0B1F4D]">
                          {(r.author_name ?? "S").slice(0, 1).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          {renderBody(r, true)}
                          {renderActions(r, false)}
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
          if (!requireAccount("comment") || !profile) {
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