"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Clock3, MapPin, Share2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { MediaCarousel } from "@/components/media/media-carousel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { PlaceOrderSocialBar } from "@/features/marketplace/place-order-social";
import { ShopPayPanel } from "@/features/marketplace/shop-pay-panel";
import { useAuth } from "@/features/auth/auth-context";
import { cn } from "@/lib/utils";
import {
  categoryLabel,
  dayLabel,
  fetchPlaceOrderListing,
  placeYourOrder,
  sharePlaceOrderPost,
  type PlaceOrderFulfilment,
} from "@/services/place-order-service";
import { formatNgn } from "@/utils/money";

const SLOTS = ["08:00–11:00", "11:00–14:00", "14:00–17:00", "17:00–20:00", "20:00–22:00"];

export function PlaceOrderDetailScreen({ listingId }: { listingId: string }) {
  const { profile, session } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [qty, setQty] = useState(1);
  const [fulfilment, setFulfilment] = useState<PlaceOrderFulfilment>("pickup");
  const [slotDay, setSlotDay] = useState<"today" | "tomorrow">("today");
  const [slotTime, setSlotTime] = useState(SLOTS[1]!);
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);

  const listingQuery = useQuery({
    queryKey: ["place-order-listing", listingId],
    queryFn: async () => (await fetchPlaceOrderListing(listingId)).listing,
  });
  const listing = listingQuery.data;

  const deliveryFee = fulfilment === "delivery" ? 500 : 0;
  const total = listing ? listing.price * qty + deliveryFee : 0;
  const dayOptions = useMemo(() => {
    if (!listing) return ["today", "tomorrow"] as const;
    if (listing.available_on === "today") return ["today"] as const;
    if (listing.available_on === "tomorrow") return ["tomorrow"] as const;
    return ["today", "tomorrow"] as const;
  }, [listing]);

  useEffect(() => {
    if (!dayOptions.includes(slotDay)) setSlotDay(dayOptions[0]!);
  }, [dayOptions, slotDay]);

  useEffect(() => {
    if (!listing) return;
    if (!listing.pickup_enabled && listing.delivery_enabled) setFulfilment("delivery");
    else if (listing.pickup_enabled && !listing.delivery_enabled) setFulfilment("pickup");
  }, [listing]);

  useEffect(() => {
    if (profile?.phone) setPhone((current) => current || profile.phone || "");
  }, [profile?.phone]);

  async function submit() {
    if (!listing) return;
    if (!session || !profile) {
      toast.error("Sign in to place your order.");
      void navigate({ to: "/login" });
      return;
    }
    if (fulfilment === "delivery" && address.trim().length < 6) {
      toast.error("Add a delivery address.");
      return;
    }
    if (!phone.trim()) {
      toast.error("Add your phone number.");
      return;
    }
    setBusy(true);
    const placed = await placeYourOrder({
      listingId: listing.id,
      businessId: listing.business_id,
      buyerId: profile.id,
      quantity: qty,
      fulfilment,
      slotDay: dayOptions.includes(slotDay) ? slotDay : dayOptions[0]!,
      slotTime,
      deliveryAddress: address,
      buyerPhone: phone,
      buyerNote: note,
      unitPrice: listing.price,
      listingTitle: listing.title,
    });
    setBusy(false);
    if (placed.error || !placed.order) {
      toast.error(placed.error ?? "Could not place the order.");
      return;
    }
    setOrderId(placed.order.id);
    toast.success("Order placed. Copy the shop account, pay, then tap I’ve made the payment.");
    await queryClient.invalidateQueries({ queryKey: ["place-order-mine"] });
    await queryClient.invalidateQueries({ queryKey: ["place-order-shop"] });
    await queryClient.invalidateQueries({ queryKey: ["activity-inbox"] });
  }

  return (
    <MarketplaceShell hideTopBar variant="feed">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
        <header className="flex items-center gap-2 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <button type="button" className="flex size-10 items-center justify-center" onClick={() => history.back()} aria-label="Back">
            <ArrowLeft className="size-5" />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-lg font-extrabold text-[#0B1F4D]">Place your order</h1>
          {listing ? (
            <button
              type="button"
              className="flex size-10 items-center justify-center"
              aria-label="Share"
              onClick={async () => {
                const result = await sharePlaceOrderPost(listing);
                if (result.shared) {
                  void queryClient.invalidateQueries({ queryKey: ["place-order-listing", listing.id] });
                  if (!navigator.share) toast.success("Link copied");
                }
              }}
            >
              <Share2 className="size-5" />
            </button>
          ) : null}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8" style={{ WebkitOverflowScrolling: "touch" }}>
          {listingQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          {!listingQuery.isLoading && !listing ? (
            <p className="text-sm text-destructive">This post is no longer open.</p>
          ) : null}
          {listing ? (
            <>
              <div className="overflow-hidden rounded-2xl border border-border">
                <div className="aspect-[4/5] bg-muted">
                  <MediaCarousel
                    urls={listing.image_urls}
                    eager
                    onDoubleTap={() => {
                      document.querySelector<HTMLButtonElement>(`[data-place-order-like="${listing.id}"]`)?.click();
                    }}
                  />
                </div>
              </div>
              <div className="-mx-2 mt-1">
                <PlaceOrderSocialBar listing={listing} />
              </div>
              <h2 className="mt-3 text-[22px] font-extrabold text-[#0B1F4D]">{listing.title}</h2>
              <p className="text-sm font-semibold text-[#1F7A4D]">{listing.shop_name}</p>
              <p className="mt-1 text-lg font-extrabold text-[#1F7A4D]">{formatNgn(listing.price)}</p>
              <p className="mt-2 text-[13px] leading-relaxed text-foreground">{listing.details || "Place your order with this shop."}</p>
              <p className="mt-2 flex flex-wrap gap-2 text-[12px] font-semibold text-muted-foreground">
                <span>{categoryLabel(listing.category)}</span>
                <span className="inline-flex items-center gap-1">
                  <Clock3 className="size-3.5" />
                  {dayLabel(listing.available_on)}
                </span>
                {listing.location_label ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3.5" />
                    {listing.location_label}
                  </span>
                ) : null}
              </p>

              <p className="mt-5 text-sm font-extrabold">Fill this form to place your order</p>
              <p className="mt-1 text-[12px] text-muted-foreground">The shop that posted this item receives the order.</p>
              <p className="mt-5 text-sm font-extrabold">Pickup or delivery</p>
              <p className="mt-1 text-[12px] text-muted-foreground">Choose how you want this order.</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {listing.pickup_enabled ? (
                  <Choice active={fulfilment === "pickup"} onClick={() => setFulfilment("pickup")} label="Pickup" />
                ) : null}
                {listing.delivery_enabled ? (
                  <Choice active={fulfilment === "delivery"} onClick={() => setFulfilment("delivery")} label="Delivery · ₦500" />
                ) : null}
              </div>
              {fulfilment === "pickup" && listing.location_label ? (
                <p className="mt-2 text-[12px] text-muted-foreground">Pickup at {listing.location_label}</p>
              ) : null}

              <p className="mt-4 text-sm font-extrabold">When</p>
              <div className="mt-2 flex gap-2">
                {dayOptions.map((day) => (
                  <Choice key={day} active={slotDay === day} onClick={() => setSlotDay(day)} label={day === "today" ? "Same day" : "Next day"} />
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {SLOTS.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSlotTime(slot)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-[12px] font-bold",
                      slotTime === slot ? "bg-[#0B1F4D] text-white" : "bg-muted text-[#0B1F4D]",
                    )}
                  >
                    {slot}
                  </button>
                ))}
              </div>

              <p className="mt-4 text-sm font-extrabold">Quantity</p>
              <div className="mt-1 flex items-center gap-2">
                <Button type="button" variant="outline" className="size-10 rounded-xl p-0" onClick={() => setQty((n) => Math.max(1, n - 1))}>
                  −
                </Button>
                <span className="w-8 text-center font-extrabold">{qty}</span>
                <Button type="button" variant="outline" className="size-10 rounded-xl p-0" onClick={() => setQty((n) => n + 1)}>
                  +
                </Button>
              </div>

              <label className="mt-4 block text-sm font-extrabold">Phone</label>
              <Input className="mt-1 min-h-11 rounded-xl" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="080…" />
              {fulfilment === "delivery" ? (
                <>
                  <label className="mt-3 block text-sm font-extrabold">Delivery address</label>
                  <Input className="mt-1 min-h-11 rounded-xl" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, area, landmark" />
                </>
              ) : null}
              <label className="mt-3 block text-sm font-extrabold">Note for the shop</label>
              <Input className="mt-1 min-h-11 rounded-xl" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Spice level, extra pack…" />

              <div className="mt-4 flex justify-between text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="text-lg font-extrabold text-[#0B1F4D]">{formatNgn(total)}</span>
              </div>
              {!orderId ? (
                <Button
                  type="button"
                  className="mt-4 min-h-12 w-full rounded-xl bg-[#1F7A4D] font-extrabold"
                  disabled={busy}
                  onClick={() => void submit()}
                >
                  {busy ? "Placing…" : "Place your order"}
                </Button>
              ) : (
                <>
                  {paid ? (
                    <p className="mt-4 rounded-2xl bg-[#1F7A4D]/10 px-3 py-3 text-center text-sm font-extrabold text-[#1F7A4D]">
                      Paid · ordered
                    </p>
                  ) : (
                    <ShopPayPanel
                      businessId={listing.business_id}
                      amount={total}
                      orderId={orderId}
                      kind="place_order"
                      itemLabel={`${qty} × ${listing.title}`}
                      onPaid={() => {
                        setPaid(true);
                        void queryClient.invalidateQueries({ queryKey: ["place-order-shop"] });
                        void queryClient.invalidateQueries({ queryKey: ["activity-inbox"] });
                      }}
                    />
                  )}
                  <Button className="mt-2 min-h-11 w-full rounded-xl" variant="outline" asChild>
                    <Link to="/shop/order-now">Back to today’s orders</Link>
                  </Button>
                </>
              )}
            </>
          ) : null}
        </div>
      </div>
    </MarketplaceShell>
  );
}

function Choice({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-11 flex-1 rounded-xl border px-3 text-[13px] font-extrabold",
        active ? "border-[#1F7A4D] bg-[#1F7A4D] text-white" : "border-border bg-white text-[#0B1F4D]",
      )}
    >
      {label}
    </button>
  );
}

