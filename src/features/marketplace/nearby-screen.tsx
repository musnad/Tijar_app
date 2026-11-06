"use client";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { LocateFixed, MapPin, Search, ShoppingBag, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { NearbyMap } from "@/features/marketplace/nearby-map";
import { ProductCard } from "@/features/marketplace/product-card";
import { useAuth } from "@/features/auth/auth-context";
import { AREA_PRESETS } from "@/lib/maps/provider";
import { fetchCart, fetchNearbyMarketplaceShops } from "@/services/marketplace-service";
import { formatDistance } from "@/utils/discover";
import { formatNgn } from "@/utils/money";
import { cn } from "@/lib/utils";

const RADIUS_OPTIONS = [5, 10, 25, 50] as const;
const DEFAULT_CENTRE = AREA_PRESETS[0]!; // Kano

export function NearbyScreen() {
  const { profile } = useAuth();
  const [centre, setCentre] = useState<{ lat: number; lng: number }>({
    lat: DEFAULT_CENTRE.lat,
    lng: DEFAULT_CENTRE.lng,
  });
  const [centreLabel, setCentreLabel] = useState(DEFAULT_CENTRE.name);
  const [radiusKm, setRadiusKm] = useState<number>(25);
  const [query, setQuery] = useState("");
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoHint, setGeoHint] = useState("");

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
      shops
        .filter((s) => typeof s.latitude === "number" && typeof s.longitude === "number")
        .map((s) => ({
          id: s.id,
          lat: s.latitude as number,
          lng: s.longitude as number,
          label: s.business_name,
          subtitle: String(s.products.length),
        })),
    [shops],
  );

  const nearbyProducts = useMemo(() => {
    if (selectedShop) return selectedShop.products;
    return shops.flatMap((s) =>
      s.products.slice(0, 2).map((p) => ({
        ...p,
        business_name: p.business_name ?? s.business_name,
        business_slug: p.business_slug ?? s.slug,
        _distance: s.distance_km,
      })),
    );
  }, [shops, selectedShop]);

  useEffect(() => {
    // Auto-request location once on mobile-friendly nearby view.
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCentre({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setCentreLabel("Your location");
        setGeoHint("");
      },
      () => {
        setGeoHint("Location off — showing a city area. Tap Near me to try again.");
      },
      { timeout: 10_000, maximumAge: 120_000 },
    );
  }, []);

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      toast.message("Location is not available on this device.");
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCentre({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setCentreLabel("Your location");
        setGeoHint("");
        setGeoBusy(false);
        toast.success("Showing shops near you");
      },
      () => {
        setGeoBusy(false);
        setGeoHint("Could not get your location. Pick a city below.");
        toast.message("Allow location access to find nearby products.");
      },
      { timeout: 12_000, maximumAge: 60_000 },
    );
  }

  const cartCount = cartQuery.data?.reduce((n, i) => n + Number(i.quantity), 0) ?? 0;

  return (
    <MarketplaceShell cartCount={cartCount} hideTopBar mapLayout>
      <div className="flex min-h-[calc(100dvh-4.5rem)] flex-col">
        <div className="shrink-0 space-y-2 pb-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h1 className="text-lg font-extrabold">Near me</h1>
              <p className="text-xs text-muted-foreground">
                {centreLabel} · within {radiusKm} km
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              className="h-10 shrink-0 rounded-xl font-bold"
              disabled={geoBusy}
              onClick={useMyLocation}
            >
              <LocateFixed className="mr-1.5 size-4" />
              {geoBusy ? "…" : "Near me"}
            </Button>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products or shops…"
              className="min-h-11 rounded-xl pl-9 text-base"
              aria-label="Search nearby products"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <select
              value={centreLabel === "Your location" ? "" : centreLabel}
              onChange={(e) => {
                const preset = AREA_PRESETS.find((a) => a.name === e.target.value);
                if (!preset) return;
                setCentre({ lat: preset.lat, lng: preset.lng });
                setCentreLabel(preset.name);
                setSelectedShopId(null);
              }}
              className="min-h-10 shrink-0 rounded-xl border border-input bg-card px-3 text-sm"
              aria-label="Choose city"
            >
              <option value="">{centreLabel === "Your location" ? "Your location" : "Choose city"}</option>
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
                  "min-h-10 shrink-0 rounded-xl border px-3 text-xs font-bold",
                  radiusKm === r
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground",
                )}
              >
                {r} km
              </button>
            ))}
          </div>
          {geoHint && <p className="text-xs text-primary">{geoHint}</p>}
        </div>

        <div className="relative min-h-[42vh] flex-1 overflow-hidden rounded-2xl border border-border bg-muted shadow-sm">
          <NearbyMap
            centre={centre}
            pins={pins}
            selectedId={selectedShopId}
            onSelect={setSelectedShopId}
            className="absolute inset-0 z-0 size-full"
          />
          <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-full bg-background/95 px-3 py-1.5 text-xs font-bold shadow-sm backdrop-blur">
            {shopsQuery.isLoading ? "Finding shops…" : `${shops.length} shops`}
          </div>
        </div>

        <section className="mt-3 shrink-0">
          {selectedShop ? (
            <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-extrabold">{selectedShop.business_name}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3.5" />
                    {formatDistance(selectedShop.distance_km)}
                    {selectedShop.category_name ? ` · ${selectedShop.category_name}` : ""}
                  </p>
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
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="outline" className="h-9 flex-1 rounded-xl text-xs font-bold" asChild>
                  <Link to="/b/$slug" params={{ slug: selectedShop.slug }}>
                    Shop page
                  </Link>
                </Button>
                <Button size="sm" className="h-9 flex-1 rounded-xl text-xs font-bold" asChild>
                  <a
                    href={`https://www.openstreetmap.org/directions?to=${selectedShop.latitude}%2C${selectedShop.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Directions
                  </a>
                </Button>
              </div>
              <p className="mt-3 text-xs font-bold text-muted-foreground">
                Products to buy ({selectedShop.products.length})
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {selectedShop.products.slice(0, 6).map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
              {selectedShop.products.length === 0 && (
                <p className="mt-2 text-sm text-muted-foreground">No products listed yet.</p>
              )}
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-extrabold">Nearby products</h2>
                <p className="text-xs text-muted-foreground">Tap a pin on the map</p>
              </div>
              {shopsQuery.isError && (
                <p className="mt-2 text-sm text-destructive">
                  Could not load nearby products. Publish informal shops with locations.
                </p>
              )}
              {!shopsQuery.isLoading && nearbyProducts.length === 0 && (
                <div className="mt-2 rounded-2xl border border-dashed border-border bg-card p-5 text-center">
                  <ShoppingBag className="mx-auto size-8 text-muted-foreground" />
                  <p className="mt-2 font-semibold">No products nearby</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Try a larger radius or another city.
                  </p>
                  <Button className="mt-3 rounded-xl font-bold" asChild>
                    <Link to="/shop">Browse all products</Link>
                  </Button>
                </div>
              )}
              <ul className="mt-2 space-y-2">
                {shops.slice(0, 8).map((shop) => {
                  const top = shop.products[0];
                  return (
                    <li key={shop.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedShopId(shop.id)}
                        className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left shadow-sm active:bg-muted/40"
                      >
                        <div className="size-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                          {top?.image_url || shop.logo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={top?.image_url || shop.logo_url || ""}
                              alt=""
                              className="size-full object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold">{shop.business_name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {top?.name ?? "Shop"} · {shop.products.length} items
                          </p>
                          <p className="mt-0.5 text-xs font-semibold text-primary">
                            {formatDistance(shop.distance_km)}
                            {top?.sale_price != null
                              ? ` · from ${formatNgn(Number(top.sale_price))}`
                              : ""}
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
