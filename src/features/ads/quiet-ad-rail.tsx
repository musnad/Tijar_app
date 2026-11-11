"use client";

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useMemo, useState } from "react";

import { rememberSponsoredAd } from "@/lib/ads/attribution";
import { cn } from "@/lib/utils";
import { fetchLiveAds, trackAdEvent, type LiveAdCard } from "@/services/ads-service";

const DISMISS_KEY = "tijar-quiet-ad-dismiss";

function dismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(DISMISS_KEY);
    const ids = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(ids.slice(-12));
  } catch {
    return new Set();
  }
}

function rememberDismiss(id: string) {
  const next = [...dismissed(), id].slice(-12);
  sessionStorage.setItem(DISMISS_KEY, JSON.stringify(next));
}

function hashPath(path: string) {
  let h = 0;
  for (const ch of path) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function pickAd(ads: LiveAdCard[], pathname: string): LiveAdCard | null {
  const skip = dismissed();
  const pool = ads.filter((ad) => !skip.has(ad.id));
  if (!pool.length) return null;
  const shop = pathname.includes("/browse") || pathname.includes("/order-now") || pathname.includes("/p/");
  const explore = pathname.includes("/discover") || pathname.includes("/nearby") || pathname.includes("/services");
  const prefer = shop
    ? pool.filter((ad) => ad.objective === "sales" || ad.source_kind === "product")
    : explore
      ? pool.filter((ad) => ad.objective === "views" || ad.objective === "followers" || ad.source_kind === "flyer")
      : pool;
  const list = prefer.length ? prefer : pool;
  return list[hashPath(pathname) % list.length] ?? null;
}

export function shouldShowQuietAd(pathname: string, opts?: { feed?: boolean; hideNav?: boolean; mapLayout?: boolean }) {
  if (opts?.hideNav || opts?.mapLayout) return false;
  if (pathname === "/shop" || pathname === "/shop/") return false;
  if (
    pathname.startsWith("/shop/ads") ||
    pathname.startsWith("/shop/checkout") ||
    pathname.startsWith("/shop/buy") ||
    pathname.startsWith("/shop/create") ||
    pathname.startsWith("/shop/studio") ||
    pathname.startsWith("/shop/settings") ||
    pathname.startsWith("/shop/payouts") ||
    pathname.startsWith("/admin")
  ) {
    return false;
  }
  return pathname.startsWith("/shop") || pathname.startsWith("/b/");
}

export function QuietAdRail({ pathname }: { pathname: string }) {
  const navigate = useNavigate();
  const [hidden, setHidden] = useState(false);
  const adsQuery = useQuery({
    queryKey: ["live-sponsored-ads-quiet"],
    queryFn: fetchLiveAds,
    staleTime: 60_000,
  });
  const ad = useMemo(() => pickAd(adsQuery.data?.ads ?? [], pathname), [adsQuery.data?.ads, pathname]);

  if (hidden || !ad) return null;

  const media = ad.flyer_url;
  const priced = Boolean(ad.product_id);

  function open() {
    rememberSponsoredAd(ad!.id, ad!.business_id);
    void trackAdEvent(ad!.id, priced ? "click" : "profile_view");
    if (ad!.destination_url) {
      window.open(ad!.destination_url, "_blank", "noopener,noreferrer");
      return;
    }
    if (ad!.product_id) {
      void navigate({ to: "/shop/p/$productId", params: { productId: ad!.product_id } });
      return;
    }
    void navigate({ to: "/b/$slug", params: { slug: ad!.shop_slug || ad!.business_id } });
  }

  return (
    <div className="px-3 pb-1">
      <div className={cn("flex items-center gap-2 rounded-2xl border border-black/5 bg-white/90 px-2 py-1.5 shadow-sm")}>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={open}>
          {media ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={media} alt="" className="size-10 shrink-0 rounded-xl object-cover" />
          ) : (
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#0B1F4D] text-[10px] font-extrabold text-white">Ad</span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-[12px] font-extrabold text-[#0B1F4D]">{ad.shop_name || ad.caption || "Paid ad"}</span>
            <span className="block truncate text-[10px] font-semibold text-muted-foreground">
              {ad.caption || "View shop"} · Paid
            </span>
          </span>
        </button>
        <button
          type="button"
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground"
          aria-label="Hide ad"
          onClick={() => {
            rememberDismiss(ad.id);
            setHidden(true);
          }}
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
