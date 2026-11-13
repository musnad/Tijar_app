"use client";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BadgeCheck, Home, MapPin, MessageCircle, Phone, Search, Store } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { useAuth } from "@/features/auth/auth-context";
import { usePrimaryBusiness } from "@/hooks/use-primary-business";
import { NIGERIA_STATE_NAMES, lgasForState, parseNigerianLocation } from "@/lib/nigeria-locations";
import { fetchCart, searchLocalBusinesses } from "@/services/marketplace-service";
import type { PublicBusiness } from "@/types/database";
import { formatShopPlaceLine } from "@/lib/maps/shop-coords";

function telHref(value: string): string {
  return `tel:${value.replace(/[^\d+]/g, "")}`;
}

function waHref(value: string): string {
  return `https://wa.me/${value.replace(/\D/g, "")}`;
}

function ServiceRow({ shop }: { shop: PublicBusiness }) {
  const place = formatShopPlaceLine(shop);
  const phone = shop.public_phone ?? shop.public_whatsapp;
  const whatsapp = shop.public_whatsapp ?? shop.public_phone;

  return (
    <li className="rounded-2xl border border-border bg-card p-3 shadow-sm">
      <Link to="/b/$slug" params={{ slug: shop.slug }} className="flex items-start gap-3">
        <div className="size-14 shrink-0 overflow-hidden rounded-2xl bg-muted">
          {shop.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shop.logo_url} alt="" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center bg-[linear-gradient(145deg,oklch(0.94_0.03_175),oklch(0.9_0.04_195))] text-lg font-extrabold text-primary">
              {shop.business_name.trim().slice(0, 1).toUpperCase() || "T"}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 font-extrabold leading-tight">
            <span className="truncate">{shop.business_name}</span>
            {shop.is_verified ? <BadgeCheck className="size-4 shrink-0 text-primary" /> : null}
          </p>
          <p className="mt-0.5 truncate text-xs font-semibold text-primary/80">
            {shop.category_name ?? "Local service"}
          </p>
          {place ? (
            <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
              <MapPin className="size-3 shrink-0" />
              {place}
            </p>
          ) : null}
          {shop.is_personal ? (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
              <Home className="size-3" /> Home seller
            </span>
          ) : null}
        </div>
      </Link>

      <div className="mt-2 grid grid-cols-2 gap-2">
        {phone ? (
          <Button size="sm" className="h-9 rounded-xl text-xs font-bold" asChild>
            <a href={telHref(phone)}>
              <Phone className="mr-1.5 size-3.5" /> Call
            </a>
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="h-9 rounded-xl text-xs font-bold" asChild>
            <Link to="/b/$slug" params={{ slug: shop.slug }}>
              Open profile
            </Link>
          </Button>
        )}
        {whatsapp ? (
          <Button size="sm" variant="outline" className="h-9 rounded-xl text-xs font-bold" asChild>
            <a href={waHref(whatsapp)} target="_blank" rel="noreferrer">
              <MessageCircle className="mr-1.5 size-3.5" /> WhatsApp
            </a>
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="h-9 rounded-xl text-xs font-bold" asChild>
            <Link to="/b/$slug" params={{ slug: shop.slug }}>
              View shop
            </Link>
          </Button>
        )}
      </div>
    </li>
  );
}

export function LocalServicesScreen() {
  const { profile } = useAuth();
  const businessQuery = usePrimaryBusiness(profile?.id);
  const [stateName, setStateName] = useState("");
  const [lga, setLga] = useState("");
  const [query, setQuery] = useState("");
  const [prefilled, setPrefilled] = useState(false);

  const ownLocation = businessQuery.data?.business?.location ?? null;
  useEffect(() => {
    if (prefilled || !ownLocation) return;
    const parsed = parseNigerianLocation(ownLocation);
    if (parsed.state) {
      setStateName(parsed.state);
      if (parsed.lga) setLga(parsed.lga);
    }
    setPrefilled(true);
  }, [ownLocation, prefilled]);

  const servicesQuery = useQuery({
    queryKey: ["local-businesses", stateName, lga],
    queryFn: async () => {
      const res = await searchLocalBusinesses({ state: stateName, lga });
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
  const cartCount = cartQuery.data?.reduce((n, i) => n + Number(i.quantity), 0) ?? 0;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = servicesQuery.data ?? [];
    if (!q) return rows;
    const words = q.split(/\s+/).filter(Boolean);
    return rows.filter((shop) =>
      words.every((w) =>
        [shop.business_name, shop.category_name ?? "", shop.description ?? "", shop.location_text ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(w),
      ),
    );
  }, [servicesQuery.data, query]);

  return (
    <MarketplaceShell cartCount={cartCount}>
      <section className="marketplace-hero relative overflow-hidden rounded-[1.35rem] p-4 text-primary-foreground shadow-lg">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/90">
          <Store className="size-3" /> Local services
        </p>
        <h1 className="mt-2.5 text-[1.35rem] font-extrabold leading-tight tracking-tight">
          Find a service in your area
        </h1>
        <p className="mt-1.5 max-w-[34ch] text-sm leading-relaxed text-white/85">
          Pick your state and local government to see nearby businesses — a barber, tailor,
          mechanic, or any service — then call them to come and do the job.
        </p>

        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search service or business name…"
            className="min-h-12 rounded-2xl border-0 bg-background pl-10 text-base text-foreground shadow-sm"
            aria-label="Search local services"
          />
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <select
            value={stateName}
            onChange={(e) => {
              setStateName(e.target.value);
              setLga("");
            }}
            className="min-h-11 w-full rounded-2xl border-0 bg-background px-3 text-sm text-foreground shadow-sm"
            aria-label="State"
          >
            <option value="">All states</option>
            {NIGERIA_STATE_NAMES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={lga}
            onChange={(e) => setLga(e.target.value)}
            disabled={!stateName}
            className="min-h-11 w-full rounded-2xl border-0 bg-background px-3 text-sm text-foreground shadow-sm disabled:opacity-60"
            aria-label="Local government area"
          >
            <option value="">{stateName ? "All LGAs" : "Pick a state first"}</option>
            {lgasForState(stateName).map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="mt-5 pb-2">
        <div className="flex items-end justify-between gap-2">
          <div>
            <h2 className="text-base font-extrabold tracking-tight">
              {lga || stateName ? `${lga ? `${lga}, ` : ""}${stateName || "Your area"}` : "All areas"}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {servicesQuery.isLoading
                ? "Finding businesses…"
                : `${results.length} ${results.length === 1 ? "business" : "businesses"}`}
            </p>
          </div>
        </div>

        {servicesQuery.isError && (
          <p className="mt-4 text-sm text-destructive">
            Could not load businesses. Check your connection and try again.
          </p>
        )}

        {!servicesQuery.isLoading && results.length === 0 && (
          <div className="mt-4 rounded-2xl border border-dashed border-border bg-card p-6 text-center">
            <Store className="mx-auto size-9 text-muted-foreground" />
            <p className="mt-2 font-semibold">No businesses found here yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try another local government area, or a bigger state.
            </p>
            {(stateName || lga) && (
              <Button
                variant="outline"
                className="mt-4 rounded-xl font-bold"
                onClick={() => {
                  setStateName("");
                  setLga("");
                }}
              >
                Show all areas
              </Button>
            )}
          </div>
        )}

        <ul className="mt-3 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {results.map((shop) => (
            <ServiceRow key={shop.id} shop={shop} />
          ))}
        </ul>
      </section>
    </MarketplaceShell>
  );
}
