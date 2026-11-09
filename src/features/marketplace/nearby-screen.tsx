"use client";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { LocateFixed, MapPin, Navigation, Search, Store, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { NearbyMap } from "@/features/marketplace/nearby-map";
import { ProductCard } from "@/features/marketplace/product-card";
import { useAuth } from "@/features/auth/auth-context";
import { useUserArea } from "@/hooks/use-user-area";
import { AREA_PRESETS, getMapsProvider } from "@/lib/maps/provider";
import { fetchCart, fetchNearbyMarketplaceShops } from "@/services/marketplace-service";
import { formatDistance } from "@/utils/discover";
import { formatNgn } from "@/utils/money";
import { cn } from "@/lib/utils";

const RADIUS_OPTIONS = [5, 10, 25, 50, 0] as const;
const DEFAULT_CENTRE = AREA_PRESETS[0]!;

export function NearbyScreen() {
  const { profile } = useAuth();
  const { coords: areaCoords, label: areaLabel } = useUserArea(profile);
  const start = areaCoords ?? { lat: DEFAULT_CENTRE.lat, lng: DEFAULT_CENTRE.lng };
  const [centre, setCentre] = useState<{ lat: number; lng: number }>(start);
  const [centreLabel, setCentreLabel] = useState(areaLabel || DEFAULT_CENTRE.name);
  const [source, setSource] = useState<"gps" | "city">("gps");
  const [followUser, setFollowUser] = useState(true);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(0);
  const [query, setQuery] = useState("");
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoHint, setGeoHint] = useState("");
  const sourceRef = useRef(source);
  sourceRef.current = source;

  const shopsQuery = useQuery({
    queryKey: ["nearby-marketplace-shops", centre.lat, centre.lng, radiusKm],
    queryFn: async () => {
      const res = await fetchNearbyMarketplaceShops({
        lat: centre.lat,
        lng: centre.lng,
        radiusKm,
      });
      if (res.error) throw new Error(res.error);
      return res.shops;
    },
    staleTime: 30_000,
  });

  const cartQuery = useQuery({
    queryKey: ["marketplace-cart", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => (await fetchCart(profile!.id)).items,
  });

  const shops = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (shopsQuery.data ?? []).filter((s) => {
      if (!q) return true;
      const hay = [
        s.business_name,
        s.category_name ?? "",
        s.description ?? "",
        s.location_text ?? "",
        s.public_location_label ?? "",
        ...s.products.map((p) => p.name),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [shopsQuery.data, query]);

  const selectedShop = shops.find((s) => s.id === selectedShopId) ?? null;

  const pins = useMemo(
    () =>
      shops.map((s) => ({
        id: s.id,
        lat: s.map_lat,
        lng: s.map_lng,
        label: s.business_name,
        subtitle: s.category_name ?? undefined,
        logoUrl: s.logo_url,
        estimated: s.location_estimated,
      })),
    [shops],
  );

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setGeoHint(
        areaLabel
          ? `GPS off — showing ${areaLabel}. Tap Near me to use your live location.`
          : "Location off — pick a city or allow GPS.",
      );
      setSource("city");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setAccuracyM(pos.coords.accuracy);
        setGeoHint("");
        if (sourceRef.current !== "gps") return;
        setCentre({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setCentreLabel("Your location");
      },
      () => {
        setGeoHint(
          areaLabel
            ? `GPS off — showing ${areaLabel}. Tap Near me to try again.`
            : "Location off — showing a city area. Tap Near me to try again.",
        );
      },
      { enableHighAccuracy: true, timeout: 14_000, maximumAge: 8_000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [areaLabel]);

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      toast.message("Location is not available on this device.");
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCentre({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setAccuracyM(pos.coords.accuracy);
        setCentreLabel("Your location");
        setSource("gps");
        setFollowUser(true);
        setGeoHint("");
        setGeoBusy(false);
        toast.success("Showing businesses near you");
      },
      () => {
        setGeoBusy(false);
        setGeoHint("Could not get your location. Pick a city below.");
        toast.message("Allow location access to find nearby businesses.");
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 20_000 },
    );
  }

  const cartCount = cartQuery.data?.reduce((n, i) => n + Number(i.quantity), 0) ?? 0;
  const radiusLabel = radiusKm === 0 ? "all of Nigeria" : `${radiusKm} km`;
  const maps = getMapsProvider();

  return (
    <MarketplaceShell cartCount={cartCount} hideTopBar mapLayout>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="absolute inset-0 z-0">
          <NearbyMap
            centre={centre}
            pins={pins}
            selectedId={selectedShopId}
            followUser={followUser && source === "gps" && !selectedShopId}
            accuracyM={accuracyM}
            onSelect={(id) => {
              setSelectedShopId(id);
              setFollowUser(false);
            }}
            onUserDrag={() => setFollowUser(false)}
            className="size-full"
          />
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 space-y-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="pointer-events-auto rounded-2xl border border-white/60 bg-background/95 p-3 shadow-[0_8px_32px_rgba(15,23,42,0.12)] backdrop-blur-md">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h1 className="text-base font-extrabold tracking-tight">Near me</h1>
                <p className="truncate text-[11px] text-muted-foreground">
                  {centreLabel} · {radiusLabel}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                className="h-9 shrink-0 rounded-full px-3 font-bold"
                disabled={geoBusy}
                onClick={useMyLocation}
              >
                <LocateFixed className="mr-1.5 size-4" />
                {geoBusy ? "…" : "Near me"}
              </Button>
            </div>

            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search shops around you…"
                className="min-h-10 rounded-xl border-border/80 bg-muted/40 pl-9 text-base"
                aria-label="Search nearby businesses"
              />
            </div>

            <div className="mt-2 flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <select
                value={source === "gps" ? "" : centreLabel}
                onChange={(e) => {
                  const preset = AREA_PRESETS.find((a) => a.name === e.target.value);
                  if (!preset) return;
                  setCentre({ lat: preset.lat, lng: preset.lng });
                  setCentreLabel(preset.name);
                  setSource("city");
                  setFollowUser(true);
                  setSelectedShopId(null);
                }}
                className="min-h-9 shrink-0 rounded-full border border-input bg-card px-3 text-xs font-semibold"
                aria-label="Choose city"
              >
                <option value="">{source === "gps" ? "Your location" : "Choose city"}</option>
                {AREA_PRESETS.map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.name}
                  </option>
                ))}
              </select>
              {RADIUS_OPTIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRadiusKm(r)}
                  className={cn(
                    "min-h-9 shrink-0 rounded-full border px-3 text-xs font-bold",
                    radiusKm === r
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground",
                  )}
                >
                  {r === 0 ? "All" : `${r} km`}
                </button>
              ))}
            </div>
            {geoHint ? <p className="mt-1.5 text-[11px] text-primary">{geoHint}</p> : null}
          </div>
        </div>

        <button
          type="button"
          className="absolute bottom-[42%] right-3 z-10 flex size-11 items-center justify-center rounded-full border border-white/70 bg-background/95 text-primary shadow-lg backdrop-blur md:bottom-8"
          aria-label="Recenter on me"
          onClick={() => {
            setFollowUser(true);
            setSelectedShopId(null);
            useMyLocation();
          }}
        >
          <Navigation className="size-5" />
        </button>

        <div className="pointer-events-none absolute left-3 top-[38%] z-10 rounded-full bg-background/90 px-3 py-1 text-[11px] font-bold shadow-sm backdrop-blur">
          {shopsQuery.isLoading ? "Finding businesses…" : `${shops.length} nearby`}
        </div>

        <section className="relative z-10 mt-auto max-h-[40%] min-h-[9.5rem] overflow-y-auto rounded-t-3xl border-t border-white/70 bg-background/97 shadow-[0_-12px_40px_rgba(15,23,42,0.14)] backdrop-blur-md">
          {selectedShop ? (
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="size-12 shrink-0 overflow-hidden rounded-2xl bg-muted ring-2 ring-white shadow-sm">
                    {selectedShop.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={selectedShop.logo_url} alt="" className="size-full object-cover" />
                    ) : (
                      <Store className="m-3 size-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-extrabold">{selectedShop.business_name}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3.5" />
                      {formatDistance(selectedShop.distance_km)}
                      {selectedShop.category_name ? ` · ${selectedShop.category_name}` : ""}
                      {selectedShop.location_estimated ? " · area" : ""}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="flex size-9 items-center justify-center rounded-full border border-border"
                  aria-label="Clear shop"
                  onClick={() => setSelectedShopId(null)}
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" className="h-10 flex-1 rounded-xl text-xs font-bold" asChild>
                  <Link to="/b/$slug" params={{ slug: selectedShop.slug }}>
                    Open shop
                  </Link>
                </Button>
                <Button size="sm" className="h-10 flex-1 rounded-xl text-xs font-bold" asChild>
                  <a
                    href={maps.directionsUrl({
                      lat: selectedShop.location_estimated ? selectedShop.map_lat : (selectedShop.latitude ?? selectedShop.map_lat),
                      lng: selectedShop.location_estimated ? selectedShop.map_lng : (selectedShop.longitude ?? selectedShop.map_lng),
                      label: selectedShop.business_name,
                    })}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Directions
                  </a>
                </Button>
              </div>
              {selectedShop.products.length > 0 ? (
                <>
                  <p className="mt-3 text-xs font-bold text-muted-foreground">
                    Products ({selectedShop.products.length})
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {selectedShop.products.slice(0, 6).map((p) => (
                      <ProductCard key={p.id} product={p} />
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No products listed yet — visit the shop page.</p>
              )}
            </div>
          ) : (
            <div className="p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-extrabold">Businesses around you</h2>
                <p className="text-xs text-muted-foreground">Tap a pin</p>
              </div>
              {shopsQuery.isError && (
                <p className="mt-2 text-sm text-destructive">Could not load nearby businesses. Try again.</p>
              )}
              {!shopsQuery.isLoading && shops.length === 0 && (
                <div className="mt-3 rounded-2xl border border-dashed border-border bg-card p-5 text-center">
                  <Store className="mx-auto size-8 text-muted-foreground" />
                  <p className="mt-2 font-semibold">No businesses in this area</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Widen the radius, tap All, or pick another city.
                  </p>
                  <Button className="mt-3 rounded-xl font-bold" asChild>
                    <Link to="/shop/discover">Browse all shops</Link>
                  </Button>
                </div>
              )}
              <ul className="mt-2 space-y-2 pb-2">
                {shops.map((shop) => {
                  const top = shop.products[0];
                  return (
                    <li key={shop.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedShopId(shop.id);
                          setFollowUser(false);
                        }}
                        className="flex w-full items-center gap-3 rounded-2xl border border-border/80 bg-card p-3 text-left shadow-sm active:bg-muted/40"
                      >
                        <div className="size-14 shrink-0 overflow-hidden rounded-2xl bg-muted ring-1 ring-black/5">
                          {shop.logo_url || top?.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={shop.logo_url || top?.image_url || ""}
                              alt=""
                              className="size-full object-cover"
                            />
                          ) : (
                            <Store className="m-4 size-6 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold">{shop.business_name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {shop.category_name ?? shop.public_location_label ?? "Shop"}
                            {shop.products.length ? ` · ${shop.products.length} items` : ""}
                          </p>
                          <p className="mt-0.5 text-xs font-semibold text-primary">
                            {formatDistance(shop.distance_km)}
                            {shop.location_estimated ? " · approx." : ""}
                            {top?.sale_price != null ? ` · from ${formatNgn(Number(top.sale_price))}` : ""}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      </div>
    </MarketplaceShell>
  );
}
