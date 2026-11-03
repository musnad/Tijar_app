"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  Landmark,
  MapPin,
  Share2,
  Store,
  Truck,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { MediaCarousel } from "@/components/media/media-carousel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { PlaceOrderSocialBar } from "@/features/marketplace/place-order-social";
import { useAuth } from "@/features/auth/auth-context";
import { useAccountGate } from "@/features/auth/account-gate";
import { cn } from "@/lib/utils";
import { fetchBusinessPayoutAccount, listAddresses } from "@/services/marketplace-service";
import {
  categoryLabel,
  dayLabel,
  fetchPlaceOrderListing,
  markPlaceOrderPaid,
  placeOrderRemaining,
  placeOrderSoldOut,
  placeYourOrder,
  sharePlaceOrderPost,
  type PlaceOrderFulfilment,
} from "@/services/place-order-service";
import { formatNgn } from "@/utils/money";

const SLOTS = ["08:00–11:00", "11:00–14:00", "14:00–17:00", "17:00–20:00", "20:00–22:00"];

export function PlaceOrderDetailScreen({ listingId }: { listingId: string }) {
  const { profile } = useAuth();
  const { requireAccount } = useAccountGate();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [buyerName, setBuyerName] = useState("");
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
  const addressQuery = useQuery({
    queryKey: ["customer-addresses", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => (await listAddresses(profile!.id)).data,
  });
  const hasAccount = Boolean(account?.payout_account_number);
  const soldOut = listing ? placeOrderSoldOut(listing) : false;
  const remaining = listing ? placeOrderRemaining(listing) : null;

  const deliveryFee = fulfilment === "delivery" ? 500 : 0;
  const total = listing ? listing.price * qty + deliveryFee : 0;
  const step: 1 | 2 = orderId ? 2 : 1;
  const dayOptions = useMemo<Array<"today" | "tomorrow">>(() => {
    if (!listing) return ["today", "tomorrow"];
    if (listing.available_on === "today") return ["today"];
    if (listing.available_on === "tomorrow") return ["tomorrow"];
    return ["today", "tomorrow"];
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
    if (profile?.full_name) setBuyerName((current) => current || profile.full_name || "");
  }, [profile?.phone, profile?.full_name]);

  useEffect(() => {
    const saved = addressQuery.data?.[0];
    if (!saved) return;
    const line = [saved.street, saved.lga, saved.city, saved.state].filter(Boolean).join(", ");
    if (line) setAddress((current) => current || line);
  }, [addressQuery.data]);

  async function copyText(label: string, value?: string | null) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy. Select the text instead.");
    }
  }

  async function submit() {
    if (!listing) return;
    if (soldOut) {
      toast.error("This post is sold out.");
      return;
    }
    if (!requireAccount("buy") || !profile) {
      return;
    }
    if (buyerName.trim().length < 2) {
      toast.error("Add your name so the shop knows who ordered.");
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
    if (qty < 1) {
      toast.error("Add how many you need.");
      return;
    }
    setBusy(true);
    const placed = await placeYourOrder({
      listingId: listing.id,
      businessId: listing.business_id,
      buyerId: profile.id,
      buyerName,
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
    toast.success("Order sent. Finish the payment below.");
    await queryClient.invalidateQueries({ queryKey: ["place-order-listing", listing.id] });
    await queryClient.invalidateQueries({ queryKey: ["place-order-listings"] });
    await queryClient.invalidateQueries({ queryKey: ["for-you-place-orders"] });
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
    toast.success("Payment sent to the shop for confirmation.");
    await queryClient.invalidateQueries({ queryKey: ["place-order-shop"] });
    await queryClient.invalidateQueries({ queryKey: ["place-order-mine"] });
    await queryClient.invalidateQueries({ queryKey: ["activity-inbox"] });
  }

  return (
    <MarketplaceShell hideTopBar variant="feed">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#F6F8FA]">
        <header className="flex shrink-0 items-center gap-2 border-b border-border bg-white px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <button type="button" className="flex size-10 items-center justify-center" onClick={() => history.back()} aria-label="Back">
            <ArrowLeft className="size-5" />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-lg font-extrabold text-[#0B1F4D]">
            {step === 2 ? "Payment" : "Place your order"}
          </h1>
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

        <div className="shrink-0 border-b border-border bg-white px-4 py-2.5">
          <Stepper step={step} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-4" style={{ WebkitOverflowScrolling: "touch" }}>
          {listingQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          {!listingQuery.isLoading && !listing ? (
            <p className="text-sm text-destructive">This post is no longer open.</p>
          ) : null}
          {listing ? (
            <>
              <ShopStrip
                logo={listing.shop_logo}
                name={listing.shop_name}
                when={dayLabel(listing.available_on)}
                location={listing.location_label}
              />

              <section className="mt-3 overflow-hidden rounded-3xl border border-border bg-white">
                <div className="aspect-[16/10] w-full bg-muted">
                  <MediaCarousel
                    urls={listing.image_urls}
                    eager
                    onDoubleTap={() => {
                      document.querySelector<HTMLButtonElement>(`[data-place-order-like="${listing.id}"]`)?.click();
                    }}
                  />
                </div>
                <div className="p-4">
                  <h2 className="text-[20px] font-extrabold leading-snug text-[#0B1F4D]">{listing.title}</h2>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="text-lg font-extrabold text-[#1F7A4D]">{formatNgn(listing.price)}</span>
                    {soldOut ? (
                      <span className="inline-flex rounded-full bg-[#0B1F4D] px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-white">
                        Sold out
                      </span>
                    ) : remaining != null ? (
                      <span className="inline-flex rounded-full bg-[#E8F5EE] px-3 py-1 text-[11px] font-extrabold text-[#1F7A4D]">
                        {remaining} left
                      </span>
                    ) : null}
                  </div>
                  {listing.details ? (
                    <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{listing.details}</p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Tag>{categoryLabel(listing.category)}</Tag>
                    <Tag icon={<Clock3 className="size-3.5" />}>{dayLabel(listing.available_on)}</Tag>
                    {listing.location_label ? <Tag icon={<MapPin className="size-3.5" />}>{listing.location_label}</Tag> : null}
                    {listing.ready_from && listing.ready_until ? (
                      <Tag icon={<Clock3 className="size-3.5" />}>{`${listing.ready_from}–${listing.ready_until}`}</Tag>
                    ) : null}
                  </div>
                </div>
                <PlaceOrderSocialBar listing={listing} compact className="border-t border-border px-2" />
              </section>

              {step === 1 ? (
                <div className="mt-4 space-y-3">
                  <Card title="Your details" hint="We fill these in from your profile — change anything if it differs.">
                    <Field label="Your name">
                      <Input
                        className="min-h-11 rounded-xl"
                        value={buyerName}
                        onChange={(e) => setBuyerName(e.target.value)}
                        placeholder="Full name"
                        autoComplete="name"
                      />
                    </Field>
                    <Field label="Phone number">
                      <Input
                        className="min-h-11 rounded-xl"
                        inputMode="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="080…"
                        autoComplete="tel"
                      />
                    </Field>
                  </Card>

                  <Card title="How many do you need?">
                    <div className="flex items-center justify-between rounded-2xl border border-border px-3 py-2">
                      <span className="text-[13px] font-bold text-muted-foreground">Packages</span>
                      <span className="flex items-center gap-3">
                        <button
                          type="button"
                          aria-label="Fewer"
                          className="flex size-9 items-center justify-center rounded-full bg-muted text-lg font-extrabold text-[#0B1F4D]"
                          onClick={() => setQty((n) => Math.max(1, n - 1))}
                        >
                          −
                        </button>
                        <span className="w-8 text-center text-lg font-extrabold text-[#0B1F4D]">{qty}</span>
                        <button
                          type="button"
                          aria-label="More"
                          className="flex size-9 items-center justify-center rounded-full bg-muted text-lg font-extrabold text-[#0B1F4D]"
                          onClick={() => setQty((n) => n + 1)}
                        >
                          +
                        </button>
                      </span>
                    </div>
                    {remaining != null ? (
                      <p className="mt-2 text-[12px] font-semibold text-muted-foreground">{remaining} left on this post.</p>
                    ) : null}
                    {listing.qty_note ? <p className="mt-1 text-[12px] text-muted-foreground">{listing.qty_note}</p> : null}
                  </Card>

                  <Card title="Pickup or delivery">
                    <div className="grid grid-cols-2 gap-2">
                      {listing.pickup_enabled ? (
                        <Option
                          active={fulfilment === "pickup"}
                          onClick={() => setFulfilment("pickup")}
                          icon={<Store className="size-4" />}
                          label="Pickup"
                          hint={listing.location_label || "At the shop"}
                        />
                      ) : null}
                      {listing.delivery_enabled ? (
                        <Option
                          active={fulfilment === "delivery"}
                          onClick={() => setFulfilment("delivery")}
                          icon={<Truck className="size-4" />}
                          label="Delivery"
                          hint="+ ₦500"
                        />
                      ) : null}
                    </div>
                    {fulfilment === "delivery" ? (
                      <Field label="Delivery address" className="mt-3">
                        <Input
                          className="min-h-11 rounded-xl"
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          placeholder="Street, area, landmark"
                          autoComplete="street-address"
                        />
                      </Field>
                    ) : null}
                  </Card>

                  <Card title="When">
                    <div className="flex gap-2">
                      {dayOptions.map((day) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => setSlotDay(day)}
                          className={cn(
                            "min-h-10 flex-1 rounded-xl border text-[12px] font-extrabold",
                            slotDay === day ? "border-[#1F7A4D] bg-[#1F7A4D] text-white" : "border-border bg-white text-[#0B1F4D]",
                          )}
                        >
                          {day === "today" ? "Same day" : "Next day"}
                        </button>
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
                  </Card>

                  <Card title="Note for the shop" hint="Optional">
                    <Input
                      className="min-h-11 rounded-xl"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Spice level, extra pack…"
                    />
                  </Card>

                  <div className="rounded-3xl border border-border bg-white p-4">
                    <TotalLine label="Item" value={formatNgn(listing.price * qty)} />
                    {deliveryFee > 0 ? <TotalLine label="Delivery" value={formatNgn(deliveryFee)} /> : null}
                    <div className="mt-2 flex items-center justify-between border-t border-border pt-3">
                      <span className="text-sm font-extrabold text-[#0B1F4D]">Total</span>
                      <span className="text-xl font-extrabold text-[#0B1F4D]">{formatNgn(total)}</span>
                    </div>
                  </div>

                  {soldOut ? (
                    <Button type="button" className="min-h-12 w-full rounded-2xl bg-[#0B1F4D]/60 font-extrabold" disabled>
                      Sold out
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      className="min-h-12 w-full rounded-2xl bg-[#1F7A4D] text-[15px] font-extrabold"
                      disabled={busy}
                      onClick={() => void submit()}
                    >
                      {busy ? "Sending…" : "Place order"}
                    </Button>
                  )}
                  <p className="pb-2 text-center text-[12px] text-muted-foreground">
                    Your order goes straight to {listing.shop_name}. Payment is on the next step.
                  </p>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <div className="flex items-start gap-3 rounded-3xl border border-[#1F7A4D]/25 bg-[#E8F5EE] p-4">
                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#1F7A4D]" />
                    <span>
                      <span className="block text-sm font-extrabold text-[#0B1F4D]">Order sent to {listing.shop_name}</span>
                      <span className="mt-0.5 block text-[12px] text-[#0B1F4D]/70">
                        {paid ? "The shop has your payment marked as paid." : "It shows as Pending until you pay."}
                      </span>
                    </span>
                  </div>

                  <div className="rounded-3xl border border-border bg-white p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Amount to send</p>
                    <p className="mt-1 text-2xl font-extrabold text-[#0B1F4D]">{formatNgn(total)}</p>
                    <TotalLine label={`${qty} × ${formatNgn(listing.price)}`} value={formatNgn(listing.price * qty)} />
                    {deliveryFee > 0 ? <TotalLine label="Delivery" value={formatNgn(deliveryFee)} /> : null}
                    <TotalLine
                      label="Order"
                      value={`${qty} package${qty === 1 ? "" : "s"} · ${fulfilment === "delivery" ? "Delivery" : "Pickup"}`}
                    />
                    <TotalLine
                      label="When"
                      value={`${slotDay === "today" ? "Same day" : "Next day"} · ${slotTime}`}
                      className="border-b-0"
                    />
                  </div>

                  <div className="rounded-3xl border border-border bg-white p-4">
                    <p className="flex items-center gap-2 text-sm font-extrabold text-[#0B1F4D]">
                      <Landmark className="size-4 text-[#1F7A4D]" /> Shop account
                    </p>
                    {hasAccount ? (
                      <div className="mt-2 space-y-2">
                        <AccountRow label="Bank" value={account?.payout_bank_name} onCopy={copyText} />
                        <AccountRow label="Account name" value={account?.payout_account_name} onCopy={copyText} />
                        <AccountRow label="Account number" value={account?.payout_account_number} onCopy={copyText} />
                      </div>
                    ) : (
                      <p className="mt-2 text-[13px] text-muted-foreground">
                        This shop has not added a bank account yet. Contact them to arrange payment.
                      </p>
                    )}
                    <p className="mt-3 text-[12px] text-muted-foreground">
                      Transfer the exact amount, then tap the button below so the shop knows it is paid.
                    </p>
                  </div>

                  <Button
                    type="button"
                    className="min-h-12 w-full rounded-2xl bg-[#1F7A4D] text-[15px] font-extrabold"
                    disabled={busy || paid}
                    onClick={() => void paidNow()}
                  >
                    {paid ? "Payment marked as paid" : busy ? "Sending…" : "I have paid"}
                  </Button>
                  <Button className="min-h-11 w-full rounded-2xl font-bold" variant="outline" asChild>
                    <Link to="/shop/order-now">Done</Link>
                  </Button>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </MarketplaceShell>
  );
}

function Stepper({ step }: { step: 1 | 2 }) {
  return (
    <ol className="flex items-center gap-2">
      <StepDot index={1} active={step === 1} done={step > 1} label="Your order" />
      <span className={cn("h-[2px] flex-1 rounded-full", step > 1 ? "bg-[#1F7A4D]" : "bg-border")} />
      <StepDot index={2} active={step === 2} done={false} label="Payment" />
    </ol>
  );
}

function StepDot({ index, label, active, done }: { index: number; label: string; active: boolean; done: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={cn(
          "flex size-7 items-center justify-center rounded-full text-[12px] font-extrabold",
          done ? "bg-[#1F7A4D] text-white" : active ? "bg-[#0B1F4D] text-white" : "bg-muted text-muted-foreground",
        )}
      >
        {done ? <Check className="size-3.5" /> : index}
      </span>
      <span className={cn("text-[12px] font-extrabold", active ? "text-[#0B1F4D]" : "text-muted-foreground")}>{label}</span>
    </li>
  );
}

function ShopStrip({
  logo,
  name,
  when,
  location,
}: {
  logo?: string | null;
  name: string;
  when: string;
  location?: string | null;
}) {
  return (
    <div className="flex items-center gap-3 rounded-3xl border border-border bg-white p-3">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="size-11 shrink-0 rounded-full border border-[#1F7A4D]/25 object-cover" />
      ) : (
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#E8F5EE] text-sm font-extrabold text-[#0B1F4D]">
          {name.slice(0, 1)}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[15px] font-extrabold text-[#0B1F4D]">{name}</span>
          <BadgeCheck className="size-4 shrink-0 fill-[#1F7A4D] text-white" />
        </span>
        <span className="mt-0.5 flex items-center gap-1 truncate text-[12px] text-muted-foreground">
          Place your order · {when}
          {location ? (
            <>
              <span aria-hidden>·</span>
              <MapPin className="size-3" />
              {location}
            </>
          ) : null}
        </span>
      </span>
    </div>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-white p-4">
      <div className="mb-2">
        <p className="text-sm font-extrabold text-[#0B1F4D]">{title}</p>
        {hint ? <p className="mt-0.5 text-[12px] text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-[12px] font-extrabold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Option({
  active,
  onClick,
  icon,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-1 rounded-2xl border px-3 py-2.5 text-left",
        active ? "border-[#1F7A4D] bg-[#E8F5EE]" : "border-border bg-white",
      )}
    >
      <span className={cn("flex items-center gap-1.5 text-[13px] font-extrabold", active ? "text-[#1F7A4D]" : "text-[#0B1F4D]")}>
        {icon}
        {label}
      </span>
      <span className="truncate text-[11px] text-muted-foreground">{hint}</span>
    </button>
  );
}

function Tag({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-[#0B1F4D]">
      {icon}
      {children}
    </span>
  );
}

function TotalLine({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between border-b border-border py-1.5 text-[13px]", className)}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-bold text-[#0B1F4D]">{value}</span>
    </div>
  );
}

function AccountRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value?: string | null | undefined;
  onCopy: (label: string, value?: string | null | undefined) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl bg-[#F8FAFC] px-3 py-2">
      <span className="min-w-0">
        <span className="block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="block truncate text-[14px] font-extrabold text-[#0B1F4D]">{value || "—"}</span>
      </span>
      {value ? (
        <button
          type="button"
          onClick={() => onCopy(label, value)}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-white px-3 py-1.5 text-[11px] font-extrabold text-[#0B1F4D]"
        >
          <Copy className="size-3.5" />
          Copy
        </button>
      ) : null}
    </div>
  );
}
