"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  BadgeCheck,
  ChevronRight,
  Compass,
  MapPin,
  Camera,
  Search,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { TijarLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppLanguageButton } from "@/features/app-layout/app-language-button";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { ProductCard } from "@/features/marketplace/product-card";
import { useAuth } from "@/features/auth/auth-context";
import { haptic } from "@/lib/haptics";
import { useTranslation } from "@/lib/i18n/context";
import { useUserArea } from "@/hooks/use-user-area";
import { AREA_PRESETS } from "@/lib/maps/provider";
import { areaRank } from "@/lib/nigeria-locations";
import { cn } from "@/lib/utils";
import { listBusinessCategories } from "@/services/business-service";
import {
  fetchCart,
  fetchMarketplaceProducts,
  fetchMarketplaceShops,
  type MarketplaceShop,
} from "@/services/marketplace-service";
import {
  catalogSuggestions,
  filterCatalogProducts,
  filterCatalogSellers,
} from "@/utils/discover-catalog";
import { filterListings, formatDistance } from "@/utils/discover";
import { searchQueryFromProductImage } from "@/lib/search-by-image";
import { searchPublicPeople } from "@/services/public-profile-service";
import type { PublicProduct } from "@/types/database";

type Tab = "products" | "services" | "sellers" | "categories" | "people";

const PRICE_CHIPS = [
  { id: "any" as const, labelKey: "shop.explore.anyPrice", min: "", max: "" },
  { id: "under10" as const, labelKey: "shop.explore.under10", min: "", max: "10000" },
  { id: "mid" as const, labelKey: "shop.explore.mid", min: "10000", max: "30000" },
  { id: "premium" as const, labelKey: "shop.explore.premium", min: "30000", max: "" },
];

export function ShopDiscoverScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { area, coords: areaCoords, label: areaLabel } = useUserArea(profile);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("products");
  const [category, setCategory] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [attribute, setAttribute] = useState("");
  const [centre, setCentre] = useState<{ lat: number; lng: number } | null>(null);
  const [centreLabel, setCentreLabel] = useState("");
  const [geoMessage, setGeoMessage] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [imageSearching, setImageSearching] = useState(false);

  useEffect(() => {
    if (centre || !areaCoords) return;
    setCentre(areaCoords);
    if (areaLabel) setCentreLabel(areaLabel);
  }, [areaCoords, areaLabel, centre]);

  const productsQuery = useInfiniteQuery({
    queryKey: ["marketplace-products-browse"],
    queryFn: async ({ pageParam }) => {
      const r = await fetchMarketplaceProducts(36, pageParam);
      if (r.error) throw new Error(r.error);
      return r;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => {
      if (last.data.length < 36) return undefined;
      return last.data[last.data.length - 1]?.created_at ?? undefined;
    },
  });
  const shopsQuery = useQuery({
    queryKey: ["marketplace-shops"],
    queryFn: async () => {
      const r = await fetchMarketplaceShops();
      if (r.error) throw new Error(r.error);
      return r.shops;
    },
  });
  const categoriesQuery = useQuery({
    queryKey: ["business-categories"],
    queryFn: async () => (await listBusinessCategories()).data,
  });
  const peopleQuery = useQuery({
    queryKey: ["public-people-search", query],
    enabled: tab === "people" || query.trim().length > 0,
    queryFn: async () => {
      const r = await searchPublicPeople(query);
      if (r.error && r.people.length === 0) throw new Error(r.error);
      return r.people;
    },
  });
  const cartQuery = useQuery({
    queryKey: ["marketplace-cart", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => (await fetchCart(profile!.id)).items,
  });

  const products = useMemo(() => {
    const pages = productsQuery.data?.pages ?? [];
    const seen = new Set<string>();
    const out: PublicProduct[] = [];
    for (const page of pages) {
      for (const product of page.data) {
        if (seen.has(product.id)) continue;
        seen.add(product.id);
        out.push(product);
      }
    }
    return out;
  }, [productsQuery.data]);
  const shops = shopsQuery.data ?? [];

  const categoryNames = useMemo(() => {
    const fromApi = (categoriesQuery.data ?? []).map((c) => c.name);
    const fromProducts = products.map((p) => p.category_name).filter(Boolean) as string[];
    const fromShops = shops.map((s) => s.category_name).filter(Boolean) as string[];
    return [...new Set([...fromApi, ...fromShops, ...fromProducts])];
  }, [categoriesQuery.data, products, shops]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const name of categoryNames) counts.set(name, 0);
    for (const product of products) {
      const name = product.category_name;
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return counts;
  }, [categoryNames, products]);

  const suggestions = useMemo(
    () =>
      catalogSuggestions({
        query,
        products,
        sellers: shops,
        categories: categoryNames,
      }),
    [query, products, shops, categoryNames],
  );

  const filteredProducts = useMemo(() => {
    const rows = filterCatalogProducts(products, {
      query,
      kind: tab === "services" ? "service" : tab === "products" ? "goods" : "all",
      category: category || null,
      minPrice: minPrice ? Number(minPrice) : null,
      maxPrice: maxPrice ? Number(maxPrice) : null,
      availableOnly,
      attribute: attribute || null,
    });
    const shopById = new Map(shops.map((shop) => [shop.id, shop]));
    return [...rows].sort((a, b) => {
      const sa = shopById.get(a.business_id);
      const sb = shopById.get(b.business_id);
      const ra = areaRank(sa?.public_location_label ?? sa?.location_text, area ?? {});
      const rb = areaRank(sb?.public_location_label ?? sb?.location_text, area ?? {});
      return rb - ra;
    });
  }, [products, query, tab, category, minPrice, maxPrice, availableOnly, attribute, shops, area]);

  const filteredSellers = useMemo(() => {
    const categoryId = category ? shops.find((s) => s.category_name === category)?.category_id : null;
    const byQuery = filterCatalogSellers(shops, query, categoryId).filter(
      (s) => !category || s.category_name === category,
    );
    if (!centre) return byQuery.map((s) => ({ ...s, distance_km: null as number | null }));
    return filterListings(
      byQuery
        .filter((s) => typeof s.latitude === "number" && typeof s.longitude === "number")
        .map((s) => ({
          ...s,
          latitude: s.latitude as number,
          longitude: s.longitude as number,
        })),
      { query, centre, radiusKm: 25 },
    );
  }, [shops, query, category, centre]);

  const featuredShops = useMemo(() => shops.slice(0, 8), [shops]);

  function useMyLocation() {
    haptic();
    if (!("geolocation" in navigator)) {
      setGeoMessage(t("shop.explore.noLocation"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCentre({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setCentreLabel("__near__");
        setGeoMessage(t("shop.explore.showingNear"));
      },
      () => setGeoMessage(t("shop.explore.locationDenied")),
      { timeout: 10_000, maximumAge: 300_000 },
    );
  }

  const cartCount = cartQuery.data?.reduce((n, i) => n + Number(i.quantity), 0) ?? 0;
  const tabs: { id: Tab; label: string }[] = [
    { id: "products", label: t("shop.explore.products") },
    { id: "services", label: t("shop.explore.services") },
    { id: "sellers", label: t("shop.explore.sellers") },
    { id: "people", label: "People" },
    { id: "categories", label: t("shop.explore.categories") },
  ];
  const people = peopleQuery.data ?? [];
  const activePrice = PRICE_CHIPS.find((c) => c.min === minPrice && c.max === maxPrice)?.id ?? "any";
  const resultCount =
    tab === "sellers"
      ? filteredSellers.length
      : tab === "people"
        ? people.length
        : tab === "categories"
          ? categoryNames.length
          : filteredProducts.length;
  const loading = products.length === 0 && (productsQuery.isPending || shopsQuery.isLoading);

  return (
    <MarketplaceShell cartCount={cartCount} hideTopBar variant="feed">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
        <header className="shrink-0 border-b border-border pt-[max(0.35rem,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <TijarLogo variant="mark" className="h-8 w-auto shrink-0" />
              <div className="min-w-0">
                <h1 className="text-[22px] font-extrabold leading-none tracking-tight text-foreground">{t("shop.explore.title")}</h1>
                <p className="mt-1 truncate text-[11px] font-medium text-muted-foreground">
                  {areaLabel ? `Nearby first · ${areaLabel}` : t("shop.explore.find")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <AppLanguageButton />
              <Button type="button" variant="outline" size="sm" className="min-h-11 rounded-full px-3" asChild>
                <Link to="/shop/order-now">Order</Link>
              </Button>
              <Button type="button" variant="outline" size="sm" className="min-h-11 rounded-full px-3" asChild>
                <Link to="/shop/nearby">
                  <MapPin className="mr-1 size-4" />
                  {t("shop.explore.map")}
                </Link>
              </Button>
            </div>
          </div>

          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => window.setTimeout(() => setShowSuggestions(false), 180)}
                placeholder="Search by product name"
                className="h-11 rounded-full border-border bg-muted/70 pl-10 pr-20"
              />
              <label className="absolute right-10 top-1/2 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted-foreground">
                <Camera className="size-4" />
                <span className="sr-only">Search by photo</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    setImageSearching(true);
                    haptic();
                    const r = await searchQueryFromProductImage(file);
                    setImageSearching(false);
                    if (r.error && !r.query) {
                      toast.error(r.error);
                      return;
                    }
                    setQuery(r.query);
                    setTab("products");
                    setShowSuggestions(false);
                  }}
                />
              </label>
              {query ? (
                <button
                  type="button"
                  aria-label={t("shop.explore.clearSearch")}
                  className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground"
                  onClick={() => setQuery("")}
                >
                  <X className="size-4" />
                </button>
              ) : null}
              {imageSearching ? (
                <p className="mt-1 px-1 text-[11px] font-semibold text-muted-foreground">Looking at your photo…</p>
              ) : null}
              {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute inset-x-0 z-20 mt-1 overflow-hidden rounded-2xl border border-border bg-white shadow-lg">
                  {suggestions.map((s) => (
                    <li key={`${s.kind}-${s.label}`}>
                      <button
                        type="button"
                        className="flex min-h-11 w-full items-center justify-between px-3 text-left text-sm hover:bg-muted/60"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          haptic();
                          setQuery(s.label);
                          setShowSuggestions(false);
                          if (s.kind === "seller") {
                            setCategory("");
                            setTab("sellers");
                          } else if (s.kind === "service") {
                            setCategory("");
                            setTab("services");
                          } else if (s.kind === "category") {
                            setCategory(s.label);
                            setTab("products");
                          } else {
                            setCategory("");
                            setTab("products");
                          }
                        }}
                      >
                        <span className="font-semibold">{s.label}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{s.kind}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <nav className="grid grid-cols-5" aria-label={t("shop.explore.title")}>
            {tabs.map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    haptic();
                    setTab(item.id);
                  }}
                  className={cn(
                    "relative flex min-h-11 items-center justify-center px-1 text-[13px]",
                    active ? "font-extrabold text-primary" : "font-semibold text-muted-foreground",
                  )}
                >
                  {item.label}
                  {active ? <span className="absolute inset-x-5 bottom-0 h-[3px] rounded-full bg-primary" /> : null}
                </button>
              );
            })}
          </nav>
        </header>

        <div
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div className="flex gap-2 overflow-x-auto px-4 py-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {PRICE_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => {
                  haptic();
                  setMinPrice(chip.min);
                  setMaxPrice(chip.max);
                }}
                className={cn(
                  "min-h-9 shrink-0 rounded-full px-3.5 text-[12px] font-bold",
                  activePrice === chip.id ? "bg-primary text-white" : "bg-muted text-foreground",
                )}
              >
                {t(chip.labelKey)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                haptic();
                useMyLocation();
              }}
              className={cn(
                "inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full px-3.5 text-[12px] font-bold",
                centreLabel === "__near__" ? "bg-primary text-white" : "bg-muted text-foreground",
              )}
            >
              <MapPin className="size-3.5" />
              {t("shop.explore.nearMe")}
            </button>
            <button
              type="button"
              onClick={() => {
                haptic();
                setFiltersOpen((o) => !o);
              }}
              className={cn(
                "inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full px-3.5 text-[12px] font-bold",
                filtersOpen || category || attribute ? "bg-primary text-white" : "bg-muted text-foreground",
              )}
            >
              <SlidersHorizontal className="size-3.5" />
              {t("shop.explore.filters")}
            </button>
          </div>

          {filtersOpen ? (
            <div className="mx-4 mb-3 grid gap-2 rounded-2xl border border-border bg-muted/40 p-3">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="min-h-11 appearance-none rounded-xl border border-input bg-white px-3 text-sm font-medium"
              >
                <option value="">{t("shop.explore.allCategories")}</option>
                {categoryNames.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={centreLabel === "__near__" ? "" : centreLabel}
                onChange={(e) => {
                  const preset = AREA_PRESETS.find((a) => a.name === e.target.value);
                  if (preset) {
                    setCentre({ lat: preset.lat, lng: preset.lng });
                    setCentreLabel(preset.name);
                    setGeoMessage(`${t("shop.explore.showingAround")} ${preset.name}.`);
                  } else {
                    setCentre(null);
                    setCentreLabel("");
                    setGeoMessage("");
                  }
                }}
                className="min-h-11 appearance-none rounded-xl border border-input bg-white px-3 text-sm font-medium"
              >
                <option value="">{t("shop.explore.allAreas")}</option>
                {AREA_PRESETS.map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.name}
                  </option>
                ))}
              </select>
              <Input
                value={attribute}
                onChange={(e) => setAttribute(e.target.value)}
                placeholder={t("shop.explore.attributePlaceholder")}
                className="h-11 rounded-xl bg-white"
              />
              <label className="flex min-h-11 items-center gap-2 rounded-xl bg-white px-3 text-sm font-medium">
                <input type="checkbox" checked={availableOnly} onChange={(e) => setAvailableOnly(e.target.checked)} />
                {t("shop.explore.inStock")}
              </label>
            </div>
          ) : null}

          {geoMessage ? <p className="px-4 pb-2 text-[11px] text-muted-foreground">{geoMessage}</p> : null}

          {query.trim() && people.length > 0 && tab !== "people" ? (
            <section className="pb-2" aria-label="People">
              <div className="flex items-center justify-between px-4 pb-2">
                <h2 className="text-[13px] font-extrabold tracking-tight">People</h2>
                <button
                  type="button"
                  className="text-[12px] font-bold text-primary"
                  onClick={() => {
                    haptic();
                    setTab("people");
                  }}
                >
                  {t("shop.explore.seeAll")}
                </button>
              </div>
              <ul className="space-y-2 px-4 pb-2">
                {people.slice(0, 4).map((person) => (
                  <li key={person.id}>
                    <Link
                      to="/shop/u/$profileId"
                      params={{ profileId: person.id }}
                      className="flex min-h-[3.5rem] items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2"
                    >
                      {person.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={person.avatarUrl} alt="" className="size-10 shrink-0 rounded-full object-cover" />
                      ) : (
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-navy,#001B3A)] text-sm font-extrabold text-white">
                          {person.fullName.slice(0, 1)}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-extrabold">{person.fullName}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">@{person.handle}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {query.trim() && filteredSellers.length > 0 && tab !== "sellers" ? (
            <section className="pb-2" aria-label={t("shop.explore.sellers")}>
              <div className="flex items-center justify-between px-4 pb-2">
                <h2 className="text-[13px] font-extrabold tracking-tight">{t("shop.explore.sellers")}</h2>
                <button
                  type="button"
                  className="text-[12px] font-bold text-primary"
                  onClick={() => {
                    haptic();
                    setTab("sellers");
                  }}
                >
                  {t("shop.explore.seeAll")}
                </button>
              </div>
              <ul className="space-y-2 px-4 pb-2">
                {filteredSellers.slice(0, 4).map((shop) => (
                  <li key={shop.id}>
                    <Link
                      to="/b/$slug"
                      params={{ slug: shop.slug }}
                      className="flex min-h-[3.5rem] items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2"
                    >
                      {shop.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={shop.logo_url} alt="" className="size-10 shrink-0 rounded-xl object-cover" />
                      ) : (
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[color:var(--brand-navy,#001B3A)] text-sm font-extrabold text-white">
                          {shop.business_name.slice(0, 1)}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-extrabold">{shop.business_name}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {shop.category_name ?? t("shop.explore.marketplaceShop")}
                          {shop.public_location_label || shop.location_text
                            ? ` · ${shop.public_location_label ?? shop.location_text}`
                            : ""}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {tab === "products" && !query && featuredShops.length > 0 ? (
            <section className="pb-2" aria-label={t("shop.explore.shops")}>
              <div className="flex items-center justify-between px-4 pb-2">
                <h2 className="text-[13px] font-extrabold tracking-tight">{t("shop.explore.shopsToFollow")}</h2>
                <button
                  type="button"
                  className="text-[12px] font-bold text-primary"
                  onClick={() => {
                    haptic();
                    setTab("sellers");
                  }}
                >
                  {t("shop.explore.seeAll")}
                </button>
              </div>
              <ul className="flex gap-3 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {featuredShops.map((shop) => (
                  <li key={shop.id} className="w-[4.75rem] shrink-0">
                    <Link
                      to="/b/$slug"
                      params={{ slug: shop.slug }}
                      className="flex flex-col items-center gap-1.5 text-center"
                    >
                      {shop.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={shop.logo_url} alt="" className="size-14 rounded-full object-cover ring-2 ring-primary/25" />
                      ) : (
                        <span className="flex size-14 items-center justify-center rounded-full bg-[color:var(--brand-navy,#001B3A)] text-sm font-extrabold text-white">
                          {shop.business_name.slice(0, 1)}
                        </span>
                      )}
                      <span className="line-clamp-2 w-full text-[10px] font-bold leading-tight">{shop.business_name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <p className="px-4 pb-2 pt-1 text-[12px] font-semibold text-muted-foreground">
            {loading
              ? t("shop.explore.loading")
              : `${resultCount} ${resultCount === 1 ? t("shop.explore.result") : t("shop.explore.results")}`}
            {category ? ` · ${category}` : ""}
          </p>

          {tab === "categories" && (
            <ul className="grid grid-cols-2 gap-2.5 px-4 pb-6">
              {categoryNames.map((c) => (
                <li key={c}>
                  <button
                    type="button"
                    className="flex min-h-[4.75rem] w-full flex-col justify-center rounded-2xl border border-border bg-card px-3.5 text-left shadow-sm"
                    onClick={() => {
                      haptic();
                      setCategory(c);
                      setTab("products");
                    }}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-extrabold leading-snug">{c}</span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </span>
                    <span className="mt-1 text-[11px] font-semibold text-muted-foreground">
                      {categoryCounts.get(c) ?? 0}{" "}
                      {(categoryCounts.get(c) ?? 0) === 1 ? t("shop.explore.listing") : t("shop.explore.listings")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {(tab === "products" || tab === "services") && (
            <>
              {filteredProducts.length === 0 && !loading ? (
                <EmptyExplore
                  title={tab === "services" ? t("shop.explore.noServices") : t("shop.explore.noMatch")}
                  body={t("shop.explore.tryAnother")}
                />
              ) : (
                <>
                  <ul className="grid grid-cols-2 gap-2.5 px-4 pb-6">
                    {loading
                      ? Array.from({ length: 6 }, (_, i) => (
                          <li key={`sk-${i}`} className="aspect-square animate-pulse rounded-xl bg-zinc-100" />
                        ))
                      : filteredProducts.map((product) => (
                          <li key={product.id}>
                            <ProductCard product={product} compact />
                          </li>
                        ))}
                  </ul>
                  {productsQuery.hasNextPage ? (
                    <div className="px-4 pb-8">
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 w-full rounded-full"
                        disabled={productsQuery.isFetchingNextPage}
                        onClick={() => void productsQuery.fetchNextPage()}
                      >
                        {productsQuery.isFetchingNextPage ? t("shop.explore.loading") : "Load more"}
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </>
          )}

          {tab === "people" && (
            <>
              {people.length === 0 && !peopleQuery.isLoading ? (
                <EmptyExplore title="No people found" body="Try a name, or open a shop and view the owner's profile." />
              ) : (
                <ul className="space-y-2 px-4 pb-6">
                  {(peopleQuery.isLoading ? [] : people).map((person) => (
                    <li key={person.id}>
                      <Link
                        to="/shop/u/$profileId"
                        params={{ profileId: person.id }}
                        className="flex min-h-[4.5rem] items-center gap-3 rounded-2xl border border-border bg-card p-3"
                      >
                        {person.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={person.avatarUrl} alt="" className="size-14 shrink-0 rounded-full object-cover" />
                        ) : (
                          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-navy,#001B3A)] text-lg font-extrabold text-white">
                            {person.fullName.slice(0, 1)}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1 font-extrabold">
                            <span className="truncate">{person.fullName}</span>
                            {person.verifiedBadge ? (
                              <BadgeCheck className="size-4 shrink-0 fill-primary text-white" aria-label={t("shop.explore.verified")} />
                            ) : null}
                          </p>
                          <p className="truncate text-[12px] text-muted-foreground">@{person.handle}</p>
                        </div>
                        <Users className="size-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {tab === "sellers" && (
            <>
              {filteredSellers.length === 0 && !loading ? (
                <EmptyExplore title={t("shop.explore.noShops")} body={t("shop.explore.noShopsBody")} />
              ) : (
                <ul className="space-y-2 px-4 pb-6">
                  {filteredSellers.map((shop) => (
                    <li key={shop.id}>
                      <Link
                        to="/b/$slug"
                        params={{ slug: shop.slug }}
                        className="flex min-h-[4.5rem] items-center gap-3 rounded-2xl border border-border bg-card p-3"
                      >
                        {shop.logo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={shop.logo_url} alt="" className="size-14 shrink-0 rounded-2xl object-cover" />
                        ) : (
                          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--brand-navy,#001B3A)] text-lg font-extrabold text-white">
                            {shop.business_name.slice(0, 1)}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1 font-extrabold">
                            <span className="truncate">{shop.business_name}</span>
                            {shop.is_verified ? (
                              <BadgeCheck className="size-4 shrink-0 fill-primary text-white" aria-label={t("shop.explore.verified")} />
                            ) : null}
                          </p>
                          <p className="truncate text-[12px] text-muted-foreground">
                            {shop.category_name ?? t("shop.explore.marketplaceShop")}
                            {"product_count" in shop && shop.product_count
                              ? ` · ${shop.product_count} ${shop.product_count === 1 ? t("shop.explore.listing") : t("shop.explore.listings")}`
                              : ""}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                            <MapPin className="size-3 shrink-0" />
                            {shop.public_location_label ?? shop.location_text ?? "Nigeria"}
                            {shop.distance_km != null ? ` · ${formatDistance(shop.distance_km)}` : ""}
                          </p>
                        </div>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </MarketplaceShell>
  );
}

function EmptyExplore({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center px-8 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-muted">
        <Compass className="size-7 text-primary" />
      </span>
      <p className="mt-4 font-extrabold text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
