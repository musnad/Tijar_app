"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeliveryProviderPicker } from "@/features/marketplace/delivery-provider-picker";
import { PaidShopContact, orderShowsShopContact } from "@/features/marketplace/paid-shop-contact";
import { ShopPayPanel } from "@/features/marketplace/shop-pay-panel";
import { fetchDeliveryProviders, type DeliveryProvider } from "@/services/delivery-providers";
import { useAuth } from "@/features/auth/auth-context";
import { cn } from "@/lib/utils";
import {
  fetchMyPlaceOrders,
  formatSlotWindow,
  placeYourOrder,
  type PlaceOrderFulfilment,
  type PlaceOrderListing,
  type PlaceOrderSlot,
} from "@/services/place-order-service";
import { formatNgn } from "@/utils/money";

const DEFAULT_SLOT = "11:00–14:00";

export function PlaceOrderForm({ listing }: { listing: PlaceOrderListing }) {
  const { profile, session } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [qty, setQty] = useState(1);
  const [fulfilment, setFulfilment] = useState<PlaceOrderFulfilment>("pickup");
  const [slotDay, setSlotDay] = useState<"today" | "tomorrow">("today");
  const [slotTime, setSlotTime] = useState("");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const [courier, setCourier] = useState<DeliveryProvider | null>(null);

  const deliveryFee = fulfilment === "delivery" ? Math.max(0, Number(courier?.fee ?? 0)) : 0;
  const total = listing.price * qty + deliveryFee;
  const dayOptions = useMemo(() => {
    const options: Array<"today" | "tomorrow"> = [];
    if (listing.same_day) options.push("today");
    if (listing.next_day) options.push("tomorrow");
    if (options.length === 0) {
      if (listing.available_on === "today") return ["today"] as const;
      if (listing.available_on === "tomorrow") return ["tomorrow"] as const;
      return ["today", "tomorrow"] as const;
    }
    return options;
  }, [listing]);
  const selectedSlot: PlaceOrderSlot | null = slotDay === "tomorrow" ? listing.next_day : listing.same_day;

  useEffect(() => {
    if (!dayOptions.includes(slotDay)) setSlotDay(dayOptions[0]!);
  }, [dayOptions, slotDay]);

  useEffect(() => {
    const slot = slotDay === "tomorrow" ? listing.next_day : listing.same_day;
    setSlotTime(slot?.from || DEFAULT_SLOT.slice(0, 5));
  }, [listing.next_day, listing.same_day, slotDay]);

  useEffect(() => {
    if (listing.location_label) setPickupAddress((cur) => cur || listing.location_label || "");
    if (!listing.pickup_enabled && listing.delivery_enabled) setFulfilment("delivery");
    else if (listing.pickup_enabled && !listing.delivery_enabled) setFulfilment("pickup");
  }, [listing]);

  useEffect(() => {
    if (profile?.phone) setPhone((current) => current || profile.phone || "");
  }, [profile?.phone]);

  useEffect(() => {
    if (!profile?.id) return;
    void fetchMyPlaceOrders(profile.id).then((res) => {
      const mine = res.orders.find((o) => o.listing_id === listing.id);
      if (!mine) return;
      setOrderId(mine.id);
      if (orderShowsShopContact(mine.status, mine.buyer_marked_paid_at)) setPaid(true);
    });
  }, [listing.id, profile?.id]);

  async function submit() {
    if (!session || !profile) {
      toast.error("Sign in to place your order.");
      void navigate({ to: "/login" });
      return;
    }
    if (!phone.trim()) {
      toast.error("Add your phone number.");
      return;
    }
    if (fulfilment === "delivery") {
      const listed = await fetchDeliveryProviders();
      if (listed.providers.length > 0 && !courier) {
        toast.error("Choose a delivery business.");
        return;
      }
      if (pickupAddress.trim().length < 4) {
        toast.error("Add a pickup destination.");
        return;
      }
      if (dropoffAddress.trim().length < 4) {
        toast.error("Add a drop-off destination.");
        return;
      }
    }
    setBusy(true);
    const placed = await placeYourOrder({
      listingId: listing.id,
      businessId: listing.business_id,
      buyerId: profile.id,
      quantity: qty,
      fulfilment,
      slotDay: dayOptions.includes(slotDay) ? slotDay : dayOptions[0]!,
      slotTime: selectedSlot ? `${formatSlotWindow({ ...selectedSlot, from: slotTime || selectedSlot.from, until: selectedSlot.until })}` : slotTime || DEFAULT_SLOT,
      deliveryAddress: dropoffAddress,
      pickupAddress,
      dropoffAddress,
      buyerPhone: phone,
      buyerNote: note,
      unitPrice: listing.price,
      listingTitle: listing.title,
      deliveryFee,
      deliveryBusinessId: courier?.id ?? null,
      deliveryName: courier ? `${courier.name} · ${courier.offerTitle}` : null,
    });
    setBusy(false);
    if (placed.error || !placed.order) {
      toast.error(placed.error ?? "Could not place the order.");
      return;
    }
    setOrderId(placed.order.id);
    toast.success("Order sent to the shop. Pay with the account below.");
    await queryClient.invalidateQueries({ queryKey: ["place-order-mine"] });
    await queryClient.invalidateQueries({ queryKey: ["place-order-shop"] });
    await queryClient.invalidateQueries({ queryKey: ["activity-inbox"] });
  }

  if (orderId) {
    if (paid) {
      return (
        <div className="space-y-3">
          <p className="rounded-2xl bg-[#1F7A4D]/10 px-3 py-3 text-center text-sm font-extrabold text-[#1F7A4D]">
            Paid · ordered
          </p>
          <PaidShopContact
            businessId={listing.business_id}
            orderRef={orderId}
            items={`${qty} × ${listing.title}`}
            amount={total}
          />
        </div>
      );
    }
    return (
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
    );
  }

  return (
    <div className="rounded-2xl border border-[#1F7A4D]/25 bg-[#F4FBF7] p-4">
      <p className="text-base font-extrabold text-[#0B1F4D]">Order form</p>
      <p className="mt-0.5 text-[12px] text-muted-foreground">Fill this and send it to {listing.shop_name}.</p>

      <div className="mt-4 space-y-4">
        <div>
          <p className="text-sm font-extrabold text-[#0B1F4D]">How many?</p>
          <div className="mt-2 flex items-center gap-3">
            <Button type="button" variant="outline" className="size-11 rounded-xl bg-white p-0 text-lg" onClick={() => setQty((n) => Math.max(1, n - 1))}>
              −
            </Button>
            <span className="w-8 text-center text-xl font-extrabold">{qty}</span>
            <Button type="button" variant="outline" className="size-11 rounded-xl bg-white p-0 text-lg" onClick={() => setQty((n) => n + 1)}>
              +
            </Button>
          </div>
        </div>

        {listing.pickup_enabled && listing.delivery_enabled ? (
          <div>
            <p className="text-sm font-extrabold text-[#0B1F4D]">Pickup or delivery</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Choice active={fulfilment === "pickup"} onClick={() => setFulfilment("pickup")} label="Pickup" />
              <Choice active={fulfilment === "delivery"} onClick={() => setFulfilment("delivery")} label="Delivery" />
            </div>
          </div>
        ) : (
          <p className="text-[13px] font-semibold text-muted-foreground">
            {fulfilment === "delivery" ? "Delivery" : listing.location_label ? `Pickup at ${listing.location_label}` : "Pickup"}
          </p>
        )}

        <div>
          <p className="text-sm font-extrabold text-[#0B1F4D]">When</p>
          {dayOptions.length > 1 ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {listing.same_day ? (
                <Choice active={slotDay === "today"} onClick={() => setSlotDay("today")} label={formatSlotWindow(listing.same_day) || "Same day"} />
              ) : null}
              {listing.next_day ? (
                <Choice active={slotDay === "tomorrow"} onClick={() => setSlotDay("tomorrow")} label={formatSlotWindow(listing.next_day) || "Next day"} />
              ) : null}
            </div>
          ) : (
            <p className="mt-1 text-[13px] font-semibold text-muted-foreground">
              {formatSlotWindow(selectedSlot) || (slotDay === "tomorrow" ? "Next day" : "Same day")}
            </p>
          )}
          <label className="mt-3 block text-sm font-extrabold text-[#0B1F4D]">
            Time
            <Input
              className="mt-1 min-h-12 rounded-xl bg-white"
              type="time"
              min={selectedSlot?.from}
              max={selectedSlot?.until}
              value={slotTime}
              onChange={(e) => setSlotTime(e.target.value)}
            />
          </label>
        </div>

        <div>
          <label className="text-sm font-extrabold text-[#0B1F4D]">Phone</label>
          <Input className="mt-1 min-h-12 rounded-xl bg-white" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="080…" inputMode="tel" />
        </div>
        {fulfilment === "delivery" ? (
          <div className="space-y-3">
            <DeliveryProviderPicker selectedId={courier?.offerId ?? null} onSelect={setCourier} />
            <label className="block text-sm font-extrabold text-[#0B1F4D]">
              Pickup destination
              <Input
                className="mt-1 min-h-12 rounded-xl bg-white"
                value={pickupAddress}
                onChange={(e) => setPickupAddress(e.target.value)}
                placeholder={listing.location_label || "Where should they collect from?"}
              />
            </label>
            <label className="block text-sm font-extrabold text-[#0B1F4D]">
              Drop-off destination
              <Input
                className="mt-1 min-h-12 rounded-xl bg-white"
                value={dropoffAddress}
                onChange={(e) => setDropoffAddress(e.target.value)}
                placeholder="Where should they deliver to?"
              />
            </label>
          </div>
        ) : null}
        <div>
          <label className="text-sm font-extrabold text-[#0B1F4D]">Note (optional)</label>
          <Input className="mt-1 min-h-12 rounded-xl bg-white" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Spice, extra pack…" />
        </div>

        {fulfilment === "delivery" ? (
          <div className="flex items-center justify-between pt-1 text-sm">
            <span className="text-muted-foreground">Delivery{courier ? ` · ${courier.name}` : ""}</span>
            <span className="font-bold">{formatNgn(deliveryFee)}</span>
          </div>
        ) : null}
        <div className="flex items-center justify-between pt-1">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="text-xl font-extrabold text-[#0B1F4D]">{formatNgn(total)}</span>
        </div>
        <Button
          type="button"
          className="min-h-12 w-full rounded-xl bg-[#1F7A4D] font-extrabold text-white hover:bg-[#1F7A4D]/90"
          disabled={busy}
          onClick={() => void submit()}
        >
          {busy ? "Sending…" : "Send order"}
        </Button>
      </div>
    </div>
  );
}

function Choice({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-xl border px-3 text-[13px] font-extrabold",
        active ? "border-[#1F7A4D] bg-[#1F7A4D] text-white" : "border-border bg-white text-[#0B1F4D]",
      )}
    >
      {label}
    </button>
  );
}
