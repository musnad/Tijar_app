"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowLeft, MapPin } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { PlaceOrderShareButton } from "@/features/marketplace/place-order-social";
import { ProductPhotosField, type ProductPhotoItem } from "@/features/products/product-photos-field";
import { useAuth } from "@/features/auth/auth-context";
import { usePrimaryBusiness } from "@/hooks/use-primary-business";
import { canUseBusinessMode } from "@/lib/account-mode";
import { cn } from "@/lib/utils";
import {
  PLACE_ORDER_CATEGORIES,
  categoryLabel,
  closePlaceOrderListing,
  fetchMyPlaceOrderListings,
  fetchShopPlaceOrders,
  placeOrderPayLabel,
  placeOrderRemaining,
  placeOrderSoldOut,
  placeOrderStatusLabel,
  publishPlaceOrderListing,
  updatePlaceOrderStatus,
  type PlaceOrderCategory,
  type PlaceOrderDay,
} from "@/services/place-order-service";
import { formatNgn } from "@/utils/money";

export function PlaceOrderComposeScreen() {
  const { profile, session } = useAuth();
  const shopQuery = usePrimaryBusiness(profile?.id);
  const business = shopQuery.data?.business;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [category, setCategory] = useState<PlaceOrderCategory>("food");
  const [price, setPrice] = useState("");
  const [photos, setPhotos] = useState<ProductPhotoItem[]>([]);
  const [location, setLocation] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [availableOn, setAvailableOn] = useState<PlaceOrderDay>("today");
  const [pickup, setPickup] = useState(true);
  const [delivery, setDelivery] = useState(true);
  const [readyFrom, setReadyFrom] = useState("10:00");
  const [readyUntil, setReadyUntil] = useState("18:00");
  const [qtyNote, setQtyNote] = useState("");
  const [quantity, setQuantity] = useState("");
  const [busy, setBusy] = useState(false);
  const search = useSearch({ strict: false }) as { tab?: string };
  const [tab, setTab] = useState<"post" | "orders">(search.tab === "orders" ? "orders" : "post");

  const mineQuery = useQuery({
    queryKey: ["place-order-mine-listings", business?.id],
    enabled: Boolean(business?.id),
    queryFn: async () => (await fetchMyPlaceOrderListings(business!.id)).listings,
  });
  const ordersQuery = useQuery({
    queryKey: ["place-order-shop", business?.id],
    enabled: Boolean(business?.id),
    queryFn: async () => (await fetchShopPlaceOrders(business!.id)).orders,
  });

  const canSell = Boolean(session && profile && canUseBusinessMode(profile) && business);

  function useMyLocation() {
    if (!navigator.geolocation) {
      toast.error("Location is not available on this device.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        if (!location.trim()) setLocation("Current location");
        toast.success("Location added.");
      },
      () => toast.error("Could not read your location."),
      { enableHighAccuracy: true, timeout: 12_000 },
    );
  }

  async function publish() {
    if (!business) return;
    if (title.trim().length < 2) {
      toast.error("Add what you are making.");
      return;
    }
    const amount = Number(price);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Add a price.");
      return;
    }
    if (!pickup && !delivery) {
      toast.error("Turn on pickup, delivery, or both.");
      return;
    }
    const stock = quantity.trim() ? Math.floor(Number(quantity)) : null;
    if (stock != null && (!Number.isFinite(stock) || stock <= 0)) {
      toast.error("How many do you have? Enter a whole number above 0, or leave it blank.");
      return;
    }
    setBusy(true);
    const published = await publishPlaceOrderListing({
      businessId: business.id,
      title,
      details,
      category,
      price: amount,
      photos: photos.map((p) => p.file).filter((file): file is File => Boolean(file)),
      existingUrls: photos.filter((p) => !p.file).map((p) => p.url),
      locationLabel: location,
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      availableOn,
      pickupEnabled: pickup,
      deliveryEnabled: delivery,
      readyFrom,
      readyUntil,
      qtyNote,
      quantity: stock,
    });
    setBusy(false);
    if (published.error || !published.listing) {
      toast.error(published.error ?? "Could not post.");
      return;
    }
    toast.success("Posted to the marketplace. Shoppers can place their order now.");
    await queryClient.invalidateQueries({ queryKey: ["place-order-listings"] });
    await queryClient.invalidateQueries({ queryKey: ["place-order-mine-listings"] });
    await queryClient.invalidateQueries({ queryKey: ["for-you-place-orders"] });
    await queryClient.invalidateQueries({ queryKey: ["for-you-listings"] });
    void navigate({ to: "/shop/order-now" });
  }

  if (!canSell) {
    return (
      <MarketplaceShell hideTopBar variant="feed">
        <div className="px-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <h1 className="text-xl font-extrabold text-[#0B1F4D]">Place your order posts</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Only business accounts with an open shop can post here. Open a shop to post what you are making today or tomorrow.
          </p>
          <Button className="mt-4 min-h-11 w-full rounded-full font-bold" asChild>
            <Link to="/shop/business-apply">Open a shop</Link>
          </Button>
        </div>
      </MarketplaceShell>
    );
  }

  return (
    <MarketplaceShell hideTopBar variant="feed">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
        <header className="flex items-center gap-2 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <button type="button" className="flex size-10 items-center justify-center" onClick={() => history.back()} aria-label="Back">
            <ArrowLeft className="size-5" />
          </button>
          <h1 className="text-lg font-extrabold text-[#0B1F4D]">Post an order</h1>
        </header>
        <div className="mx-4 mb-2 grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
          <button type="button" className={cn("min-h-10 rounded-full text-sm font-extrabold", tab === "post" ? "bg-white text-[#0B1F4D]" : "text-muted-foreground")} onClick={() => setTab("post")}>
            New post
          </button>
          <button type="button" className={cn("min-h-10 rounded-full text-sm font-extrabold", tab === "orders" ? "bg-white text-[#0B1F4D]" : "text-muted-foreground")} onClick={() => setTab("orders")}>
            Incoming ({ordersQuery.data?.length ?? 0})
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8" style={{ WebkitOverflowScrolling: "touch" }}>
          {tab === "post" ? (
            <>
              <p className="text-[13px] text-muted-foreground">Post food or snacks you make from time to time. Shoppers pick pickup or delivery, a time, and pay you.</p>
              <label className="mt-4 block text-sm font-extrabold">Photos</label>
              <div className="mt-2">
                <ProductPhotosField photos={photos} onChange={setPhotos} />
              </div>
              <label className="mt-4 block text-sm font-extrabold">What are you making?</label>
              <Input className="mt-1 min-h-11 rounded-xl" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Jollof + chicken, small chops…" />
              <label className="mt-3 block text-sm font-extrabold">Details</label>
              <textarea
                className="mt-1 min-h-24 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="What is in it, how many packs, spice, extra…"
              />
              <p className="mt-3 text-sm font-extrabold">Category</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {PLACE_ORDER_CATEGORIES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCategory(item)}
                    className={cn("rounded-full px-3 py-1.5 text-[12px] font-bold", category === item ? "bg-[#0B1F4D] text-white" : "bg-muted")}
                  >
                    {categoryLabel(item)}
                  </button>
                ))}
              </div>
              <label className="mt-3 block text-sm font-extrabold">Price (₦)</label>
              <Input className="mt-1 min-h-11 rounded-xl" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="2500" />
              <p className="mt-3 text-sm font-extrabold">Available</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(
                  [
                    ["today", "Same day"],
                    ["tomorrow", "Next day"],
                    ["both", "Both"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setAvailableOn(id)}
                    className={cn("min-h-11 rounded-xl border text-[12px] font-extrabold", availableOn === id ? "border-[#1F7A4D] bg-[#1F7A4D] text-white" : "border-border")}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-sm font-extrabold">How they collect</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setPickup((v) => !v)} className={cn("min-h-11 rounded-xl border text-[13px] font-extrabold", pickup ? "border-[#1F7A4D] bg-[#1F7A4D] text-white" : "border-border")}>
                  Pickup
                </button>
                <button type="button" onClick={() => setDelivery((v) => !v)} className={cn("min-h-11 rounded-xl border text-[13px] font-extrabold", delivery ? "border-[#1F7A4D] bg-[#1F7A4D] text-white" : "border-border")}>
                  Delivery
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="text-sm font-extrabold">
                  Ready from
                  <Input className="mt-1 min-h-11 rounded-xl" type="time" value={readyFrom} onChange={(e) => setReadyFrom(e.target.value)} />
                </label>
                <label className="text-sm font-extrabold">
                  Until
                  <Input className="mt-1 min-h-11 rounded-xl" type="time" value={readyUntil} onChange={(e) => setReadyUntil(e.target.value)} />
                </label>
              </div>
              <label className="mt-3 block text-sm font-extrabold">Location</label>
              <Input className="mt-1 min-h-11 rounded-xl" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Area, street, landmark" />
              <Button type="button" variant="outline" className="mt-2 min-h-11 w-full rounded-xl font-bold" onClick={useMyLocation}>
                <MapPin className="mr-1.5 size-4" />
                Use my location
              </Button>
              <label className="mt-3 block text-sm font-extrabold">How many do you have? (optional)</label>
              <Input className="mt-1 min-h-11 rounded-xl" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="10" />
              <p className="mt-1 text-[12px] text-muted-foreground">The count drops as shoppers order. At 0 the post shows Sold out and the Place order button is hidden.</p>
              <label className="mt-3 block text-sm font-extrabold">How many / packs (optional)</label>
              <Input className="mt-1 min-h-11 rounded-xl" value={qtyNote} onChange={(e) => setQtyNote(e.target.value)} placeholder="20 packs, while it lasts" />
              <Button type="button" className="mt-5 min-h-12 w-full rounded-xl bg-[#1F7A4D] font-extrabold" disabled={busy} onClick={() => void publish()}>
                {busy ? "Posting…" : "Post place your order"}
              </Button>
              {(mineQuery.data?.length ?? 0) > 0 ? (
                <div className="mt-6">
                  <p className="text-sm font-extrabold">Your open posts</p>
                  <ul className="mt-2 space-y-2">
                    {mineQuery.data?.map((item) => (
                      <li key={item.id} className="rounded-xl border px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold">{item.title}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {placeOrderSoldOut(item)
                                ? "Sold out"
                                : item.is_open
                                  ? placeOrderRemaining(item) != null
                                    ? `${placeOrderRemaining(item)} left`
                                    : "Open"
                                  : "Closed"}{" "}
                              · {formatNgn(item.price)}
                            </p>
                          </div>
                          {item.is_open ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                await closePlaceOrderListing(item.id);
                                await queryClient.invalidateQueries({ queryKey: ["place-order-mine-listings"] });
                                await queryClient.invalidateQueries({ queryKey: ["place-order-listings"] });
                              }}
                            >
                              Close
                            </Button>
                          ) : null}
                        </div>
                        <div className="mt-2">
                          <PlaceOrderShareButton listing={item} label="Share post" />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : (
            <ul className="space-y-3">
              {(ordersQuery.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No incoming orders yet. When a shopper places an order, it shows here as Pending or Paid, with their phone and address.</p> : null}
              {(ordersQuery.data ?? []).map((order) => {
                const paid = placeOrderPayLabel(order.status) === "Paid";
                return (
                <li key={order.id} className="rounded-2xl border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-extrabold text-[#0B1F4D]">{order.listing_title ?? "Order"}</p>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-extrabold", paid ? "bg-[#1F7A4D]/12 text-[#1F7A4D]" : "bg-amber-100 text-amber-900")}>
                      {placeOrderPayLabel(order.status)}
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] font-bold">{order.buyer_name ?? "Customer"}</p>
                  <p className="text-[13px] text-muted-foreground">
                    {order.quantity} × {formatNgn(order.unit_price)} · {order.fulfilment === "delivery" ? "Delivery" : "Pickup"} · {order.slot_day === "today" ? "Same day" : "Next day"} · {order.slot_time}
                  </p>
                  <p className="mt-1 text-sm font-extrabold text-[#1F7A4D]">{formatNgn(order.total)}</p>
                  <p className="mt-2 text-[12px] font-semibold">Phone {order.buyer_phone || "not given"}</p>
                  {order.fulfilment === "delivery" ? (
                    <p className="text-[12px]">Deliver to {order.delivery_address || "no address yet"}</p>
                  ) : (
                    <p className="text-[12px]">Customer will pick up</p>
                  )}
                  {order.buyer_note ? <p className="mt-1 text-[12px] text-muted-foreground">Note: {order.buyer_note}</p> : null}
                  <p className="mt-1 text-[11px] font-bold uppercase text-muted-foreground">{placeOrderStatusLabel(order.status)}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {["paid", "preparing", "ready", "completed"].map((status) => (
                      <Button
                        key={status}
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        onClick={async () => {
                          await updatePlaceOrderStatus(order.id, status);
                          await queryClient.invalidateQueries({ queryKey: ["place-order-shop"] });
                          await queryClient.invalidateQueries({ queryKey: ["activity-inbox"] });
                        }}
                      >
                        {placeOrderStatusLabel(status)}
                      </Button>
                    ))}
                  </div>
                </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </MarketplaceShell>
  );
}
