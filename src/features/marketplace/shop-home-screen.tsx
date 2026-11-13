"use client";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BadgeCheck, ChevronRight, MapPin, Search, Sparkles, Store, UtensilsCrossed } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { SectorCatalogDrawer } from "@/features/marketplace/sector-catalog-drawer";
import {
  MARKETPLACE_SECTORS,
  countShopsBySector,
  matchesShopSector,
} from "@/features/marketplace/marketplace-sectors";
import { ProductCard } from "@/features/marketplace/product-card";
import { NigeriaAreaFields } from "@/features/location/nigeria-area-fields";
import { useAuth } from "@/features/auth/auth-context";
import { useUserArea, writeStoredUserArea } from "@/hooks/use-user-area";
import { areaRank, formatNigerianLocation } from "@/lib/nigeria-locations";
import { fetchCart, fetchMarketplaceProducts, fetchMarketplaceShops, type MarketplaceShop } from "@/services/marketplace-service";
import { saveOwnArea } from "@/services/profile-service";
import { useViewerLocation } from "@/hooks/use-viewer-location";
import { formatShopPlaceLine } from "@/lib/maps/shop-coords";

function ShopCard({ shop, viewer }: { shop: MarketplaceShop; viewer?: { lat: number; lng: number } | null }) {
  const place = formatShopPlaceLine(shop, viewer);
  const initial = shop.business_name.trim().slice(0, 1).toUpperCase() || "T";

  return (
    <Link
      to="/b/$slug"
      params={{ slug: shop.slug }}
      className="flex h-full gap-3 rounded-2xl border border-border/80 bg-card p-3 shadow-[0_1px_2px_rgba(15,40,50,0.04)] transition hover:border-primary/35 hover:shadow-md"
    >
      <div className="size-16 shrink-0 overflow-hidden rounded-2xl bg-muted">
        {shop.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shop.logo_url} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center bg-[linear-gradient(145deg,oklch(0.94_0.03_175),oklch(0.9_0.04_195))] text-lg font-extrabold text-primary">
            {initial}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 font-extrabold leading-tight">
          <span className="truncate">{shop.business_name}</span>
          {shop.is_verified ? <BadgeCheck className="size-4 shrink-0 text-primary" /> : null}
        </p>
        <p className="mt-0.5 truncate text-xs font-semibold text-primary/80">
          {shop.category_name ?? "Informal business"}
        </p>
        {place ? (
          <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
            <MapPin className="size-3 shrink-0" />
            {place}
          </p>
        ) : null}
        <p className="mt-1 text-[11px] text-muted-foreground">
          {shop.product_count > 0
            ? `${shop.product_count} ${shop.product_count === 1 ? "listing" : "listings"}`
            : "Shop listed"}
        </p>
      </div>
      <ChevronRight className="mt-5 size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

export function ShopHomeScreen() {
  const { profile } = useAuth();
  const { area, label: areaLabel, save: saveArea } = useUserArea(profile);
  const viewer = useViewerLocation(true);
  const [query, setQuery] = useState("");
  const [sectorFilter, setSectorFilter] = useState("");
  const [pickState, setPickState] = useState(area?.state ?? "");
  const [pickLga, setPickLga] = useState(area?.lga ?? "");

  const shopsQuery = useQuery({
    queryKey: ["marketplace-shops"],
    queryFn: async () => {
      const res = await fetchMarketplaceShops();
      if (res.error) throw new Error(res.error);
      return res.shops;
    },
    staleTime: 30_000,
  });
  const productsQuery = useQuery({
    queryKey: ["marketplace-products-home"],
    queryFn: async () => {
      const res = await fetchMarketplaceProducts(80);
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    staleTime: 30_000,
  });

  const cartQuery = useQuery({
    queryKey: ["marketplace-cart", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      const res = await fetchCart(profile!.id);
      if (res.error) throw new Error(res.error);
      return res.items;
    },
  });

  const allShops = shopsQuery.data ?? [];
  const sectorCounts = useMemo(() => countShopsBySector(allShops), [allShops]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allShops
      .filter((shop) => {
        if (sectorFilter && !matchesShopSector(shop, sectorFilter)) return false;
        if (!q) return true;
        const hay = [
          shop.business_name,
          shop.description ?? "",
          shop.category_name ?? "",
          shop.public_location_label ?? "",
          shop.location_text ?? "",
          ...shop.product_names,
        ]
          .join(" ")
          .toLowerCase();
        return q.split(/\s+/).filter(Boolean).every((word) => hay.includes(word));
      })
      .sort((a, b) => {
        const ra = areaRank(a.public_location_label ?? a.location_text, area ?? {});
        const rb = areaRank(b.public_location_label ?? b.location_text, area ?? {});
        return rb - ra || a.business_name.localeCompare(b.business_name);
      });
  }, [allShops, query, sectorFilter, area]);
  const nearbyProducts = useMemo(() => {
    const products = productsQuery.data ?? [];
    const shopById = new Map(allShops.map((shop) => [shop.id, shop]));
    return [...products]
      .sort((a, b) => {
        const sa = shopById.get(a.business_id);
        const sb = shopById.get(b.business_id);
        const ra = areaRank(sa?.public_location_label ?? sa?.location_text ?? a.business_name, area ?? {});
        const rb = areaRank(sb?.public_location_label ?? sb?.location_text ?? b.business_name, area ?? {});
        return rb - ra;
      })
      .filter((p) => {
        if (!area?.state) return true;
        const shop = shopById.get(p.business_id);
        return areaRank(shop?.public_location_label ?? shop?.location_text, area) > 0;
      })
      .slice(0, 8);
  }, [productsQuery.data, allShops, area]);

  const activeSector = MARKETPLACE_SECTORS.find((s) => s.key === sectorFilter);
  const cartCount = cartQuery.data?.reduce((n, i) => n + Number(i.quantity), 0) ?? 0;
  const firstName = profile?.full_name?.trim().split(/\s+/)[0];
  const listedCount = allShops.length;
  const withGoods = allShops.filter((s) => s.product_count > 0).length;

  return (
    <MarketplaceShell
      cartCount={cartCount}
      leftSlot={
        <SectorCatalogDrawer
          sectorFilter={sectorFilter}
          counts={sectorCounts}
          onSelect={(key) => setSectorFilter((prev) => (key === prev ? "" : key))}
        />
      }
    >
      <section className="marketplace-hero relative overflow-hidden rounded-[1.35rem] p-4 text-primary-foreground shadow-lg sm:p-5 lg:grid lg:grid-cols-[1.4fr_0.7fr] lg:items-end lg:gap-8 lg:p-8">
        <div
          className="pointer-events-none absolute -right-8 -top-10 size-36 rounded-full bg-white/10 blur-2xl"
          aria-hidden
        />
        <div className="relative">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/90">
            <Sparkles className="size-3" /> Informal businesses
          </p>
          <h1 className="mt-2.5 text-[1.35rem] font-extrabold leading-tight tracking-tight sm:text-2xl lg:text-4xl">
            {firstName ? `Welcome, ${firstName}` : "Discover local shops"}
          </h1>
          <p className="mt-1.5 max-w-[32ch] text-sm leading-relaxed text-white/85">
            {areaLabel
              ? `Shops and products near ${areaLabel} first.`
              : "Every TIJAR shop that publishes its business appears here."}
          </p>

          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by shop name, area, or category…"
              className="min-h-12 rounded-2xl border-0 bg-background pl-10 text-base text-foreground shadow-sm"
              aria-label="Search businesses"
            />
          </div>

          <Button
            className="mt-3 min-h-11 w-full rounded-2xl border-0 bg-white font-extrabold text-[oklch(0.32_0.06_195)] hover:bg-white/95"
            asChild
          >
            <Link to="/shop/order-now">
              <UtensilsCrossed className="mr-1.5 size-4" /> Place your order · same day & next day
            </Link>
          </Button>
          <div className="mt-2 flex gap-2">
            <Button
              className="min-h-11 flex-1 rounded-2xl border-0 bg-white/90 font-bold text-[oklch(0.32_0.06_195)] hover:bg-white"
              asChild
            >
              <Link to="/shop/nearby">
                <MapPin className="mr-1.5 size-4" /> Near me
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 flex-1 rounded-2xl border-white/35 bg-white/10 font-bold text-white hover:bg-white/20 hover:text-white"
              onClick={() => document.querySelector<HTMLButtonElement>("[aria-label='Open business sectors catalog']")?.click()}
            >
              <Store className="mr-1.5 size-4" /> Sectors
            </Button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white/12 px-2 py-2 text-center backdrop-blur-sm">
              <p className="text-base font-extrabold tabular-nums">{listedCount}</p>
              <p className="text-[10px] font-semibold text-white/75">Listed shops</p>
            </div>
            <div className="rounded-xl bg-white/12 px-2 py-2 text-center backdrop-blur-sm">
              <p className="text-base font-extrabold tabular-nums">{withGoods}</p>
              <p className="text-[10px] font-semibold text-white/75">With products</p>
            </div>
          </div>
        </div>
      </section>

      {!area?.state ? (
        <section className="mt-4 rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-extrabold">Where should we look?</h2>
          <p className="mt-1 text-xs text-muted-foreground">Pick your state and local government to see nearby products first.</p>
          <div className="mt-3">
            <NigeriaAreaFields
              variant="plain"
              state={pickState}
              lga={pickLga}
              onState={setPickState}
              onLga={setPickLga}
            />
          </div>
          <Button
            className="mt-3 min-h-11 w-full rounded-xl font-bold"
            type="button"
            disabled={!pickState || !pickLga}
            onClick={() => {
              const next = { state: pickState, lga: pickLga };
              writeStoredUserArea(next);
              saveArea(next);
              if (profile?.id) {
                void saveOwnArea({
                  state: pickState,
                  lga: pickLga,
                  location: formatNigerianLocation(pickState, pickLga),
                });
              }
            }}
          >
            Show nearby products
          </Button>
        </section>
      ) : null}

      {nearbyProducts.length > 0 ? (
        <section className="mt-5">
          <div className="flex items-end justify-between gap-2">
            <div>
              <h2 className="text-base font-extrabold tracking-tight">Near you</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {areaLabel ? `Suggested from ${areaLabel}` : "Products from shops around you"}
              </p>
            </div>
            <Link to="/shop/nearby" className="text-xs font-bold text-primary">
              Map
            </Link>
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {nearbyProducts.map((product) => (
              <li key={product.id}>
                <ProductCard product={product} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {activeSector ? (
        <div className="mt-3 flex items-center justify-between rounded-2xl border border-primary/20 bg-primary/5 px-3 py-2">
          <p className="text-xs font-bold text-primary">{activeSector.label}</p>
          <button
            type="button"
            className="text-xs font-bold text-primary"
            onClick={() => setSectorFilter("")}
          >
            Show all
          </button>
        </div>
      ) : null}

      <section className="mt-5 pb-2">
        <div className="flex items-end justify-between gap-2">
          <div>
            <h2 className="text-base font-extrabold tracking-tight">
              {query.trim() ? "Search results" : "Listed businesses"}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {filtered.length} {filtered.length === 1 ? "shop" : "shops"}
            </p>
          </div>
        </div>

        {shopsQuery.isLoading && (
          <ul className="mt-3 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="flex gap-3 rounded-2xl border border-border bg-card p-3">
                <div className="size-16 animate-pulse rounded-2xl bg-muted" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-3 w-[70%] animate-pulse rounded bg-muted" />
                  <div className="h-3 w-[40%] animate-pulse rounded bg-muted" />
                </div>
              </li>
            ))}
          </ul>
        )}

        {shopsQuery.isError && (
          <p className="mt-4 text-sm text-destructive">
            Could not load businesses. Publish informal shops from the business dashboard.
          </p>
        )}

        {!shopsQuery.isLoading && filtered.length === 0 && (
          <div className="mt-4 rounded-2xl border border-dashed border-border bg-card p-6 text-center">
            <Store className="mx-auto size-9 text-muted-foreground" />
            <p className="mt-2 font-semibold">
              {sectorFilter || query.trim() ? "No shops in this filter" : "No shops listed yet"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              When a business registers and publishes its shop, it appears here.
            </p>
            {(sectorFilter || query.trim()) && (
              <Button
                variant="outline"
                className="mt-4 rounded-xl font-bold"
                onClick={() => {
                  setSectorFilter("");
                  setQuery("");
                }}
              >
                Show all shops
              </Button>
            )}
          </div>
        )}

        <ul className="mt-3 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {filtered.map((shop) => (
            <li key={shop.id} className="min-w-0">
              <ShopCard shop={shop} viewer={viewer.coords} />
            </li>
          ))}
        </ul>
      </section>
    </MarketplaceShell>
  );
}
