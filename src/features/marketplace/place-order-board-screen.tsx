"use client";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Clock3, MapPin, Search, UtensilsCrossed } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { PlaceOrderSocialBar } from "@/features/marketplace/place-order-social";
import { useAuth } from "@/features/auth/auth-context";
import { canUseBusinessMode } from "@/lib/account-mode";
import { cn } from "@/lib/utils";
import {
  categoryLabel,
  dayLabel,
  fetchPlaceOrderListings,
  type PlaceOrderCategory,
  type PlaceOrderListing,
} from "@/services/place-order-service";
import { formatNgn } from "@/utils/money";

const DAYS = [
  { id: "all" as const, label: "All" },
  { id: "today" as const, label: "Same day" },
  { id: "tomorrow" as const, label: "Next day" },
];

const CATS: Array<{ id: "all" | PlaceOrderCategory; label: string }> = [
  { id: "all", label: "All" },
  { id: "food", label: "Food" },
  { id: "snacks", label: "Snacks" },
  { id: "meals", label: "Meals" },
  { id: "drinks", label: "Drinks" },
  { id: "photography", label: "Photography" },
  { id: "events", label: "Event planning" },
  { id: "services", label: "Services" },
];

export function PlaceOrderBoardScreen() {
  const { profile } = useAuth();
  const canPost = Boolean(profile && canUseBusinessMode(profile));
  const [search, setSearch] = useState("");
  const [day, setDay] = useState<"all" | "today" | "tomorrow">("all");
  const [category, setCategory] = useState<"all" | PlaceOrderCategory>("all");

  const query = useQuery({
    queryKey: ["place-order-listings", day, category, search],
    queryFn: async () => {
      const r = await fetchPlaceOrderListings({ day, category, search });
      return r;
    },
  });

  const listings = query.data?.listings ?? [];
  const setupError = query.data?.error;

  return (
    <MarketplaceShell hideTopBar variant="feed">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
        <header className="shrink-0 border-b border-border px-4 pb-3 pt-[max(0.65rem,env(safe-area-inset-top))]">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#1F7A4D]">Place your order</p>
          <h1 className="mt-1 text-[22px] font-extrabold tracking-tight text-[#0B1F4D]">What is cooking</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">Order food, snacks, and meals — or book photographers and event planners near you.</p>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search jollof, small chops, suya…"
              className="h-11 rounded-full bg-muted/70 pl-10"
            />
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {DAYS.map((item) => (
              <Chip key={item.id} active={day === item.id} onClick={() => setDay(item.id)}>
                {item.label}
              </Chip>
            ))}
          </div>
          <div className="mt-2 flex gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {CATS.map((item) => (
              <Chip key={item.id} active={category === item.id} onClick={() => setCategory(item.id)}>
                {item.label}
              </Chip>
            ))}
          </div>
          {canPost ? (
            <Button className="mt-3 min-h-11 w-full rounded-full bg-[#1F7A4D] font-extrabold" asChild>
              <Link to="/shop/create-order">Post what you are making</Link>
            </Button>
          ) : null}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" style={{ WebkitOverflowScrolling: "touch" }}>
          {query.isLoading ? <p className="text-sm text-muted-foreground">Loading today’s orders…</p> : null}
          {setupError ? <p className="rounded-2xl bg-amber-50 px-3 py-2 text-[13px] font-semibold text-amber-900">{setupError}</p> : null}
          {!query.isLoading && listings.length === 0 && !setupError ? (
            <div className="rounded-2xl border border-dashed p-6 text-center">
              <UtensilsCrossed className="mx-auto size-8 text-[#1F7A4D]" />
              <p className="mt-3 font-extrabold text-[#0B1F4D]">Nothing posted yet</p>
              <p className="mt-1 text-sm text-muted-foreground">When a shop taps Post place your order, it appears here and on For You for shoppers to place an order.</p>
            </div>
          ) : null}
          <ul className="space-y-3">
            {listings.map((item) => (
              <li key={item.id}>
                <ListingCard listing={item} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </MarketplaceShell>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full px-3 py-1.5 text-[12px] font-bold",
        active ? "bg-[#0B1F4D] text-white" : "bg-muted text-[#0B1F4D]",
      )}
    >
      {children}
    </button>
  );
}

function ListingCard({ listing }: { listing: PlaceOrderListing }) {
  const photo = listing.image_urls[0];
  const when = useMemo(() => dayLabel(listing.available_on), [listing.available_on]);
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-[0_1px_2px_rgba(15,40,50,0.05)]">
      <Link
        to="/shop/order-now/$listingId"
        params={{ listingId: listing.id }}
        className="flex gap-3"
      >
        <div className="size-[6.5rem] shrink-0 bg-muted">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center text-[#1F7A4D]">
              <UtensilsCrossed className="size-7" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 py-2.5 pr-3">
          <p className="truncate text-[15px] font-extrabold text-[#0B1F4D]">{listing.title}</p>
          <span className="mt-0.5 flex items-center gap-1.5">
            {listing.shop_logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={listing.shop_logo}
                alt=""
                className="size-[1.15rem] shrink-0 rounded-full border border-[#1F7A4D]/25 object-cover"
              />
            ) : (
              <span className="flex size-[1.15rem] shrink-0 items-center justify-center rounded-full bg-[#E8F5EE] text-[9px] font-extrabold text-[#0B1F4D]">
                {(listing.shop_name ?? "S").slice(0, 1)}
              </span>
            )}
            <span className="truncate text-[12px] font-semibold text-[#1F7A4D]">{listing.shop_name}</span>
          </span>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span>{categoryLabel(listing.category)}</span>
            <span className="inline-flex items-center gap-0.5">
              <Clock3 className="size-3" />
              {when}
            </span>
          </p>
          {listing.location_label ? (
            <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
              <MapPin className="size-3 shrink-0" />
              {listing.location_label}
            </p>
          ) : null}
          <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">
            {listing.pickup_enabled ? "Pickup" : ""}
            {listing.pickup_enabled && listing.delivery_enabled ? " · " : ""}
            {listing.delivery_enabled ? "Delivery" : ""}
          </p>
          <p className="mt-1.5 text-[15px] font-extrabold text-[#1F7A4D]">{formatNgn(listing.price)}</p>
        </div>
      </Link>
      <PlaceOrderSocialBar listing={listing} compact className="border-t border-border px-1" />
    </div>
  );
}
