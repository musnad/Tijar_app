"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowLeft, Handshake, MapPin, Pencil, Search, Trash2, X } from "lucide-react";
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
  cancelPlaceOrderCollab,
  categoryLabel,
  closePlaceOrderListing,
  deletePlaceOrderListing,
  fetchIncomingCollabRequests,
  fetchMyPlaceOrderListings,
  fetchSentCollabRequests,
  fetchShopPlaceOrders,
  placeOrderPayLabel,
  placeOrderRemaining,
  placeOrderSoldOut,
  placeOrderStatusLabel,
  publishPlaceOrderListing,
  requestPlaceOrderCollab,
  respondPlaceOrderCollab,
  reopenPlaceOrderListing,
  searchShopsForCollab,
  updatePlaceOrderListing,
  updatePlaceOrderStatus,
  type PlaceOrderCategory,
  type PlaceOrderCollab,
  type PlaceOrderDay,
  type PlaceOrderListing,
} from "@/services/place-order-service";
import { formatNgn } from "@/utils/money";

type Tab = "post" | "orders" | "collabs";

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [collabFor, setCollabFor] = useState<PlaceOrderListing | null>(null);
  const search = useSearch({ strict: false }) as { tab?: string };
  const [tab, setTab] = useState<Tab>(search.tab === "orders" ? "orders" : "post");

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
  const inboxQuery = useQuery({
    queryKey: ["place-order-collab-inbox", business?.id],
    enabled: Boolean(business?.id),
    queryFn: async () => fetchIncomingCollabRequests(business!.id),
  });
  const sentQuery = useQuery({
    queryKey: ["place-order-collab-sent", business?.id],
    enabled: Boolean(business?.id),
    queryFn: async () => fetchSentCollabRequests(business!.id),
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

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setDetails("");
    setCategory("food");
    setPrice("");
    setPhotos([]);
    setLocation("");
    setCoords(null);
    setAvailableOn("today");
    setPickup(true);
    setDelivery(true);
    setReadyFrom("10:00");
    setReadyUntil("18:00");
    setQtyNote("");
    setQuantity("");
  }

  function startEdit(item: PlaceOrderListing) {
    setEditingId(item.id);
    setTab("post");
    setTitle(item.title);
    setDetails(item.details ?? "");
    setCategory(item.category);
    setPrice(String(item.price));
    setPhotos(item.image_urls.map((url) => ({ url })));
    setLocation(item.location_label ?? "");
    setCoords(item.latitude != null && item.longitude != null ? { lat: item.latitude, lng: item.longitude } : null);
    setAvailableOn(item.available_on);
    setPickup(item.pickup_enabled);
    setDelivery(item.delivery_enabled);
    setReadyFrom(item.ready_from ?? "");
    setReadyUntil(item.ready_until ?? "");
    setQtyNote(item.qty_note ?? "");
    setQuantity(item.quantity != null ? String(item.quantity) : "");
  }

  async function refreshPosts() {
    await queryClient.invalidateQueries({ queryKey: ["place-order-listings"] });
    await queryClient.invalidateQueries({ queryKey: ["place-order-mine-listings"] });
    await queryClient.invalidateQueries({ queryKey: ["for-you-place-orders"] });
    await queryClient.invalidateQueries({ queryKey: ["for-you-listings"] });
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
    if (editingId) {
      const saved = await updatePlaceOrderListing(
        editingId,
        business.id,
        {
          title,
          details,
          category,
          price: amount,
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
        },
        photos.map((item) => (item.file ? { file: item.file, url: item.url } : { url: item.url })),
      );
      setBusy(false);
      if (saved.error || !saved.listing) {
        toast.error(saved.error ?? "Could not save the changes.");
        return;
      }
      toast.success("Post updated.");
      resetForm();
      await refreshPosts();
      return;
    }
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
    resetForm();
    await refreshPosts();
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

  const sent = sentQuery.data ?? [];
  const inbox = inboxQuery.data ?? [];

  return (
    <MarketplaceShell hideTopBar variant="feed">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
        <header className="flex items-center gap-2 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <button type="button" className="flex size-10 items-center justify-center" onClick={() => history.back()} aria-label="Back">
            <ArrowLeft className="size-5" />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-lg font-extrabold text-[#0B1F4D]">
            {editingId ? "Edit post" : "Post an order"}
          </h1>
        </header>
        <div className="mx-4 mb-2 grid grid-cols-3 gap-1 rounded-full bg-muted p-1">
          <TabButton active={tab === "post"} onClick={() => setTab("post")}>
            {editingId ? "Editing" : "New post"}
          </TabButton>
          <TabButton active={tab === "orders"} onClick={() => setTab("orders")}>
            Orders ({ordersQuery.data?.length ?? 0})
          </TabButton>
          <TabButton active={tab === "collabs"} onClick={() => setTab("collabs")}>
            Collabs ({inbox.length})
          </TabButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8" style={{ WebkitOverflowScrolling: "touch" }}>
          {tab === "post" ? (
            <>
              <p className="text-[13px] text-muted-foreground">
                Post food or snacks you make from time to time. Shoppers pick pickup or delivery, a time, and pay you.
              </p>
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
                {busy ? "Saving…" : editingId ? "Save changes" : "Post place your order"}
              </Button>
              {editingId ? (
                <Button type="button" variant="outline" className="mt-2 min-h-11 w-full rounded-xl font-bold" onClick={resetForm}>
                  Cancel edit
                </Button>
              ) : null}
              {(mineQuery.data?.length ?? 0) > 0 ? (
                <div className="mt-6">
                  <p className="text-sm font-extrabold">Your posts</p>
                  <ul className="mt-2 space-y-2">
                    {mineQuery.data?.map((item) => {
                      const collabs = sent.filter((c) => c.listing_id === item.id);
                      return (
                        <li key={item.id} className="rounded-2xl border px-3 py-3">
                          <div className="flex items-start gap-3">
                            {item.image_urls[0] ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={item.image_urls[0]} alt="" className="size-12 shrink-0 rounded-xl object-cover" />
                            ) : null}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold">{item.title}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {item.is_guest ? "Collaboration · " : ""}
                                {placeOrderSoldOut(item)
                                  ? "Sold out"
                                  : item.is_open
                                    ? placeOrderRemaining(item) != null
                                      ? `${placeOrderRemaining(item)} left`
                                      : "Open"
                                    : "Closed"}{" "}
                                · {formatNgn(item.price)}
                              </p>
                              {collabs.length > 0 ? (
                                <p className="mt-1 text-[11px] font-semibold text-[#1F7A4D]">
                                  Collab: {collabs.map((c) => `${c.guest_shop_name} (${c.status})`).join(", ")}
                                </p>
                              ) : null}
                            </div>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" className="rounded-full" onClick={() => startEdit(item)}>
                              <Pencil className="mr-1 size-3.5" />
                              Edit
                            </Button>
                            <Button size="sm" variant="outline" className="rounded-full" onClick={() => setCollabFor(item)}>
                              <Handshake className="mr-1 size-3.5" />
                              Collaborate
                            </Button>
                            {item.is_open ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-full"
                                onClick={async () => {
                                  await closePlaceOrderListing(item.id);
                                  await refreshPosts();
                                }}
                              >
                                Close
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-full"
                                onClick={async () => {
                                  await reopenPlaceOrderListing(item.id);
                                  await refreshPosts();
                                }}
                              >
                                Reopen
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-full text-destructive"
                              onClick={async () => {
                                if (!window.confirm(`Delete "${item.title}"? Shoppers will no longer see it.`)) return;
                                const removed = await deletePlaceOrderListing(item.id);
                                if (removed.error) {
                                  toast.error(removed.error);
                                  return;
                                }
                                if (editingId === item.id) resetForm();
                                toast.success("Post deleted.");
                                await refreshPosts();
                              }}
                            >
                              <Trash2 className="mr-1 size-3.5" />
                              Delete
                            </Button>
                          </div>
                          <div className="mt-2">
                            <PlaceOrderShareButton listing={item} label="Share post" />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </>
          ) : tab === "orders" ? (
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
          ) : (
            <ul className="space-y-3">
              {inbox.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No collaboration requests. Other shops can invite you to share their post on both accounts — it shows here.
                </p>
              ) : null}
              {inbox.map((request) => (
                <li key={request.id} className="rounded-2xl border p-3">
                  <div className="flex items-start gap-3">
                    {request.listing_image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={request.listing_image} alt="" className="size-12 shrink-0 rounded-xl object-cover" />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-extrabold text-[#0B1F4D]">{request.listing_title ?? "Post"}</p>
                      <p className="text-[12px] font-semibold text-[#1F7A4D]">{request.host_shop_name} invited you</p>
                      {request.message ? <p className="mt-1 text-[12px] text-muted-foreground">“{request.message}”</p> : null}
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 rounded-full bg-[#1F7A4D] font-extrabold"
                      onClick={async () => {
                        const result = await respondPlaceOrderCollab({
                          collabId: request.id,
                          accept: true,
                          guestBusinessId: request.guest_business_id,
                          hostBusinessId: request.host_business_id,
                          listingTitle: request.listing_title ?? "post",
                          actorId: profile!.id,
                        });
                        if (result.error) {
                          toast.error(result.error);
                          return;
                        }
                        toast.success("Accepted. The post now shows on your account too.");
                        await queryClient.invalidateQueries({ queryKey: ["place-order-collab-inbox"] });
                        await queryClient.invalidateQueries({ queryKey: ["place-order-mine-listings"] });
                        await queryClient.invalidateQueries({ queryKey: ["place-order-shop"] });
                      }}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 rounded-full font-bold"
                      onClick={async () => {
                        const result = await respondPlaceOrderCollab({
                          collabId: request.id,
                          accept: false,
                          guestBusinessId: request.guest_business_id,
                          hostBusinessId: request.host_business_id,
                          listingTitle: request.listing_title ?? "post",
                          actorId: profile!.id,
                        });
                        if (result.error) {
                          toast.error(result.error);
                          return;
                        }
                        toast.success("Request declined.");
                        await queryClient.invalidateQueries({ queryKey: ["place-order-collab-inbox"] });
                      }}
                    >
                      Decline
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {collabFor ? (
        <CollaborateSheet
          listing={collabFor}
          businessId={business!.id}
          actorId={profile!.id}
          existing={sent.filter((c) => c.listing_id === collabFor.id)}
          onClose={() => setCollabFor(null)}
        />
      ) : null}
    </MarketplaceShell>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={cn("min-h-10 rounded-full text-[13px] font-extrabold", active ? "bg-white text-[#0B1F4D]" : "text-muted-foreground")}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function CollaborateSheet({
  listing,
  businessId,
  actorId,
  existing,
  onClose,
}: {
  listing: PlaceOrderListing;
  businessId: string;
  actorId: string;
  existing: PlaceOrderCollab[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [term, setTerm] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const resultsQuery = useQuery({
    queryKey: ["place-order-shop-search", businessId, term],
    enabled: term.trim().length >= 2,
    queryFn: async () => searchShopsForCollab(term, businessId),
  });
  const takenIds = new Set(existing.map((c) => c.guest_business_id));

  async function invite(shopId: string, shopName: string) {
    setBusyId(shopId);
    const result = await requestPlaceOrderCollab({
      listingId: listing.id,
      listingTitle: listing.title,
      hostBusinessId: businessId,
      guestBusinessId: shopId,
      actorId,
    });
    setBusyId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Request sent to ${shopName}.`);
    setTerm("");
    await queryClient.invalidateQueries({ queryKey: ["place-order-collab-sent"] });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" role="dialog" aria-modal>
      <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between">
          <p className="text-base font-extrabold text-[#0B1F4D]">Collaborate on this post</p>
          <button type="button" className="flex size-9 items-center justify-center" aria-label="Close" onClick={onClose}>
            <X className="size-5" />
          </button>
        </div>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Invite another shop. When they accept, “{listing.title}” shows on both accounts and both see the orders.
        </p>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="min-h-11 rounded-xl pl-9"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search a shop by name"
          />
        </div>
        <ul className="mt-3 space-y-2">
          {(resultsQuery.data ?? []).map((shop) => {
            const invited = takenIds.has(shop.id);
            return (
              <li key={shop.id} className="flex items-center gap-3 rounded-2xl border px-3 py-2">
                {shop.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={shop.logo} alt="" className="size-9 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#E8F5EE] text-[12px] font-extrabold text-[#0B1F4D]">
                    {shop.name.slice(0, 1)}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-[#0B1F4D]">{shop.name}</span>
                <Button
                  size="sm"
                  className="rounded-full font-extrabold"
                  disabled={invited || busyId === shop.id}
                  onClick={() => void invite(shop.id, shop.name)}
                >
                  {invited ? "Invited" : busyId === shop.id ? "Sending…" : "Invite"}
                </Button>
              </li>
            );
          })}
          {term.trim().length >= 2 && !resultsQuery.isLoading && (resultsQuery.data ?? []).length === 0 ? (
            <li className="text-[13px] text-muted-foreground">No shop matches “{term.trim()}”.</li>
          ) : null}
        </ul>
        {existing.length > 0 ? (
          <div className="mt-4 border-t border-border pt-3">
            <p className="text-[12px] font-extrabold uppercase tracking-wide text-muted-foreground">Invited</p>
            <ul className="mt-2 space-y-2">
              {existing.map((collab) => (
                <li key={collab.id} className="flex items-center gap-2 rounded-2xl bg-muted px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[#0B1F4D]">{collab.guest_shop_name}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-extrabold",
                      collab.status === "accepted"
                        ? "bg-[#1F7A4D]/12 text-[#1F7A4D]"
                        : collab.status === "declined"
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-900",
                    )}
                  >
                    {collab.status === "accepted" ? "Accepted" : collab.status === "declined" ? "Declined" : "Pending"}
                  </span>
                  <button
                    type="button"
                    aria-label="Remove invitation"
                    onClick={async () => {
                      await cancelPlaceOrderCollab(collab.id);
                      await queryClient.invalidateQueries({ queryKey: ["place-order-collab-sent"] });
                    }}
                  >
                    <X className="size-4 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
