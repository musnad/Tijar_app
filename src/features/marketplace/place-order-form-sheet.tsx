"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ShopPayPanel } from "@/features/marketplace/shop-pay-panel";
import { useAuth } from "@/features/auth/auth-context";
import { cn } from "@/lib/utils";
import {
  placeYourOrder,
  type PlaceOrderFulfilment,
  type PlaceOrderListing,
} from "@/services/place-order-service";
import { formatNgn } from "@/utils/money";

const DEFAULT_SLOT = "11:00–14:00";

export function PlaceOrderFormSheet({
  listing,
  open,
  onOpenChange,
}: {
  listing: PlaceOrderListing;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { profile, session } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [qty, setQty] = useState(1);
  const [fulfilment, setFulfilment] = useState<PlaceOrderFulfilment>("pickup");
  const [slotDay, setSlotDay] = useState<"today" | "tomorrow">("today");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);

  const deliveryFee = fulfilment === "delivery" ? 500 : 0;
  const total = listing.price * qty + deliveryFee;
  const dayOptions = useMemo(() => {
    if (listing.available_on === "today") return ["today"] as const;
    if (listing.available_on === "tomorrow") return ["tomorrow"] as const;
    return ["today", "tomorrow"] as const;
  }, [listing.available_on]);

  useEffect(() => {
    if (!dayOptions.includes(slotDay)) setSlotDay(dayOptions[0]!);
  }, [dayOptions, slotDay]);

  useEffect(() => {
    if (!listing.pickup_enabled && listing.delivery_enabled) setFulfilment("delivery");
    else if (listing.pickup_enabled && !listing.delivery_enabled) setFulfilment("pickup");
  }, [listing]);

  useEffect(() => {
    if (profile?.phone) setPhone((current) => current || profile.phone || "");
  }, [profile?.phone]);

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
    if (fulfilment === "delivery" && address.trim().length < 6) {
      toast.error("Add a delivery address.");
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
      slotTime: listing.ready_from?.trim() || DEFAULT_SLOT,
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
    toast.success("Order sent to the shop. Pay with the account below.");
    await queryClient.invalidateQueries({ queryKey: ["place-order-mine"] });
    await queryClient.invalidateQueries({ queryKey: ["place-order-shop"] });
    await queryClient.invalidateQueries({ queryKey: ["activity-inbox"] });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[88vh] overflow-y-auto rounded-t-3xl px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="text-lg font-extrabold text-[#0B1F4D]">Your order</SheetTitle>
          <p className="text-[13px] text-muted-foreground">
            {listing.title} · {formatNgn(listing.price)} · {listing.shop_name}
          </p>
        </SheetHeader>

        {orderId ? (
          paid ? (
            <p className="mt-5 rounded-2xl bg-[#1F7A4D]/10 px-3 py-3 text-center text-sm font-extrabold text-[#1F7A4D]">
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
          )
        ) : (
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-sm font-extrabold text-[#0B1F4D]">How many?</p>
              <div className="mt-2 flex items-center gap-3">
                <Button type="button" variant="outline" className="size-11 rounded-xl p-0 text-lg" onClick={() => setQty((n) => Math.max(1, n - 1))}>
                  −
                </Button>
                <span className="w-8 text-center text-xl font-extrabold">{qty}</span>
                <Button type="button" variant="outline" className="size-11 rounded-xl p-0 text-lg" onClick={() => setQty((n) => n + 1)}>
                  +
                </Button>
              </div>
            </div>

            {listing.pickup_enabled && listing.delivery_enabled ? (
              <div>
                <p className="text-sm font-extrabold text-[#0B1F4D]">Pickup or delivery</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Choice active={fulfilment === "pickup"} onClick={() => setFulfilment("pickup")} label="Pickup" />
                  <Choice active={fulfilment === "delivery"} onClick={() => setFulfilment("delivery")} label="Delivery · ₦500" />
                </div>
              </div>
            ) : (
              <p className="text-[13px] font-semibold text-muted-foreground">
                {fulfilment === "delivery" ? "Delivery · ₦500" : listing.location_label ? `Pickup at ${listing.location_label}` : "Pickup"}
              </p>
            )}

            {dayOptions.length > 1 ? (
              <div>
                <p className="text-sm font-extrabold text-[#0B1F4D]">When</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Choice active={slotDay === "today"} onClick={() => setSlotDay("today")} label="Today" />
                  <Choice active={slotDay === "tomorrow"} onClick={() => setSlotDay("tomorrow")} label="Tomorrow" />
                </div>
              </div>
            ) : (
              <p className="text-[13px] font-semibold text-muted-foreground">
                {slotDay === "tomorrow" ? "Ready tomorrow" : "Ready today"}
              </p>
            )}

            <div>
              <label className="text-sm font-extrabold text-[#0B1F4D]">Phone</label>
              <Input className="mt-1 min-h-12 rounded-xl" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="080…" inputMode="tel" />
            </div>
            {fulfilment === "delivery" ? (
              <div>
                <label className="text-sm font-extrabold text-[#0B1F4D]">Delivery address</label>
                <Input className="mt-1 min-h-12 rounded-xl" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, area, landmark" />
              </div>
            ) : null}
            <div>
              <label className="text-sm font-extrabold text-[#0B1F4D]">Note (optional)</label>
              <Input className="mt-1 min-h-12 rounded-xl" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Spice, extra pack…" />
            </div>

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
        )}
      </SheetContent>
    </Sheet>
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
