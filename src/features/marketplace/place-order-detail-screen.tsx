"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Building2, Clock3, Landmark, MapPin, Share2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { MediaCarousel } from "@/components/media/media-carousel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { PlaceOrderSocialBar } from "@/features/marketplace/place-order-social";
import { useAuth } from "@/features/auth/auth-context";
import { cn } from "@/lib/utils";
import { fetchBusinessPayoutAccount } from "@/services/marketplace-service";
import {
  categoryLabel,
  dayLabel,
  fetchPlaceOrderListing,
  markPlaceOrderPaid,
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
  const accountQuery = useQuery({
    queryKey: ["payout-account", listing?.business_id],
    enabled: Boolean(listing?.business_id),
    queryFn: async () => (await fetchBusinessPayoutAccount(listing!.business_id)).account,
  });
  const account = accountQuery.data;
  const hasAccount = Boolean(account?.payout_account_number);

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
    });
    setBusy(false);
    if (placed.error || !placed.order) {
      toast.error(placed.error ?? "Could not place the order.");
      return;
    }
    setOrderId(placed.order.id);
    toast.success(hasAccount ? "Order placed. Transfer to the shop, then tap I have paid." : "Order placed. The shop will see it as pending.");
    await queryClient.invalidateQueries({ queryKey: ["place-order-mine"] });
    await queryClient.invalidateQueries({ queryKey: ["place-order-shop"] });
    await queryClient.invalidateQueries({ queryKey: ["activity-inbox"] });
  }

  async function paidNow() {
    if (!orderId) return;
    setBusy(true);
    const r = await markPlaceOrderPaid(orderId);
    setBusy(false);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    setPaid(true);
    toast.success("Marked as paid. The shop can see it in notifications.");
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
              <span className="flex items-center gap-1.5">
                {listing.shop_logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={listing.shop_logo}
                    alt=""
                    className="size-5 shrink-0 rounded-full border border-[#1F7A4D]/25 object-cover"
                  />
                ) : (
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#E8F5EE] text-[10px] font-extrabold text-[#0B1F4D]">
                    {(listing.shop_name ?? "S").slice(0, 1)}
                  </span>
                )}
                <span className="text-sm font-semibold text-[#1F7A4D]">{listing.shop_name}</span>
              </span>
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

              <p className="mt-5 text-sm font-extrabold">Pay the shop</p>
              <div className="mt-2 flex items-start gap-3 rounded-2xl border border-primary bg-primary/5 p-3">
                <Landmark className="mt-0.5 size-5 text-primary" />
                <span>
                  <span className="block text-sm font-extrabold">Transfer to shop</span>
                  <span className="mt-0.5 block text-[12px] text-muted-foreground">Send the total, then tap I have paid.</span>
                </span>
              </div>
              <div className="mt-3 rounded-2xl border border-[#EEF1F5] bg-[#F8FAFC] p-3 text-sm">
                <p className="flex items-center gap-1.5 font-extrabold text-[#0B1F4D]">
                  <Building2 className="size-4" /> Shop account
                </p>
                {hasAccount ? (
                  <dl className="mt-2 space-y-1 text-[13px]">
                    <Row label="Bank" value={account?.payout_bank_name} />
                    <Row label="Name" value={account?.payout_account_name} />
                    <Row label="Number" value={account?.payout_account_number} />
                  </dl>
                ) : (
                  <p className="mt-2 text-[13px] text-muted-foreground">This shop has not added a bank account yet.</p>
                )}
              </div>

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
                  <Button
                    type="button"
                    className="mt-4 min-h-12 w-full rounded-xl bg-[#1F7A4D] font-extrabold"
                    disabled={busy || paid}
                    onClick={() => void paidNow()}
                  >
                    {paid ? "Payment marked" : busy ? "Saving…" : "I have paid"}
                  </Button>
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

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-bold">{value}</dd>
    </div>
  );
}
