"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { FeedImage } from "@/components/media/feed-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { ShopPayPanel } from "@/features/marketplace/shop-pay-panel";
import { isMockFeedId } from "@/features/marketplace/feed-mock";
import { useAuth } from "@/features/auth/auth-context";
import { shopDeliveryFee } from "@/lib/checkout/delivery-fee";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  addToCart,
  fetchMarketplaceProduct,
  placeOrders,
} from "@/services/marketplace-service";
import { formatPricePerUnit, formatUnitWord, lineTotal, normalizeQty, unitMinQty, unitStep } from "@/lib/catalogue/units";
import { formatNgn } from "@/utils/money";
import { useTranslation } from "@/lib/i18n/context";

export function BuyScreen({ productId, initialQty }: { productId?: string; initialQty?: number }) {
  const { t } = useTranslation();
  const { profile, session } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [qty, setQty] = useState(initialQty && initialQty > 0 ? initialQty : 1);
  const [fulfilment, setFulfilment] = useState<"pickup" | "seller_delivery">("pickup");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [paidNow, setPaidNow] = useState(false);

  const productQuery = useQuery({
    queryKey: ["marketplace-product", productId],
    enabled: Boolean(productId),
    queryFn: async () => {
      const r = await fetchMarketplaceProduct(productId!);
      if (r.error) throw new Error(r.error);
      if (!r.product) throw new Error("This product is not available.");
      return r.product;
    },
  });

  const product = productQuery.data;
  const feeQuery = useQuery({
    queryKey: ["shop-delivery-fee", product?.business_id],
    enabled: Boolean(product?.business_id),
    queryFn: async () => {
      const { data } = await getSupabaseBrowserClient()
        .from("businesses")
        .select("delivery_fee")
        .eq("id", product!.business_id)
        .maybeSingle();
      return Number(data?.delivery_fee ?? 0);
    },
  });
  const unitPrice = product?.sale_price != null ? Number(product.sale_price) : 0;
  const goodsTotal = product?.sale_price != null ? lineTotal(unitPrice, qty) : 0;
  const deliveryFee = shopDeliveryFee(fulfilment, feeQuery.data);
  const total = product?.sale_price != null ? goodsTotal + deliveryFee : 0;
  const unitWord = formatUnitWord(product?.unit, qty);

  function requireSignIn() {
    if (productId && typeof window !== "undefined") {
      sessionStorage.setItem("tijar-after-login", `/shop/buy?productId=${encodeURIComponent(productId)}`);
    }
    toast.error(t("shop.buy.signIn"));
    void navigate({ to: "/login" });
  }

  async function confirm() {
    if (!product || product.sale_price == null) {
      toast.error("This listing has no price.");
      return;
    }
    if (isMockFeedId(product.id)) {
      toast.error("This listing is not available.");
      return;
    }
    if (!session || !profile) {
      requireSignIn();
      return;
    }
    if (!phone.trim()) {
      toast.error("Add your phone number.");
      return;
    }
    if (fulfilment === "seller_delivery") {
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
    const added = await addToCart(profile.id, {
      businessId: product.business_id,
      productId: product.id,
      productName: product.name,
      unit: product.unit,
      unitPrice: Number(product.sale_price),
      quantity: qty,
      imageUrl: product.image_url,
    });
    if (added.error) {
      toast.error(added.error);
      setBusy(false);
      return;
    }
    const placed = await placeOrders({
      fulfilment,
      buyerNote: [
        "Pay: Transfer to shop",
        fulfilment === "seller_delivery" ? `Pickup: ${pickupAddress.trim()}` : null,
        fulfilment === "seller_delivery" ? `Drop-off: ${dropoffAddress.trim()}` : null,
        note,
      ]
        .filter(Boolean)
        .join(" · "),
      buyerPhone: phone,
      idempotencyKey: crypto.randomUUID(),
      paymentMethod: "transfer",
      paymentDestination: "seller",
    });
    if (placed.error || placed.orders.length === 0) {
      setBusy(false);
      toast.error(placed.error ?? "Could not place the order.");
      return;
    }
    const order = placed.orders[0]!;
    setOrderId(order.id);
    await queryClient.invalidateQueries({ queryKey: ["marketplace-orders"] });
    setBusy(false);
    toast.success("Order placed. Copy the shop account to pay.");
  }

  return (
    <MarketplaceShell hideTopBar variant="feed">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white in-[.native-shop]:bg-[var(--native-canvas,#F3F5F8)]">
        <header className="flex items-center gap-2 px-3 py-2">
          <button type="button" className="flex size-10 items-center justify-center" onClick={() => history.back()} aria-label="Back">
            <ArrowLeft className="size-5" />
          </button>
          <h1 className="text-lg font-extrabold text-[#0B1F4D]">{t("shop.buy.title")}</h1>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
          {!productId ? (
            <p className="text-sm text-muted-foreground">
              {t("shop.buy.pickFirst")}{" "}
              <Link to="/shop" className="font-bold text-primary">
                {t("shop.buy.browse")}
              </Link>
            </p>
          ) : productQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("shop.buy.loading")}</p>
          ) : !product ? (
            <p className="text-sm text-destructive">{t("shop.buy.notFound")}</p>
          ) : (
            <>
              <div className="flex gap-3 rounded-2xl border border-border p-3">
                <div className="size-20 overflow-hidden rounded-xl bg-muted">
                  {product.image_url ? (
                    <FeedImage src={product.image_url} alt="" eager width={160} />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold text-[#0B1F4D]">{product.name}</p>
                  <p className="text-sm text-muted-foreground">{product.business_name}</p>
                  <p className="mt-1 font-extrabold text-[#1F7A4D]">
                    {formatPricePerUnit(Number(product.sale_price), product.unit, formatNgn)}
                  </p>
                </div>
              </div>

              <label className="mt-4 block text-sm font-bold">
                {product.unit === "yard" || product.unit === "metre" ? `How many ${formatUnitWord(product.unit, 2)}?` : t("shop.buy.quantity")}
              </label>
              <div className="mt-1 flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="size-10 rounded-xl p-0"
                  onClick={() => setQty((n) => normalizeQty(n - unitStep(product.unit), product.unit))}
                >
                  −
                </Button>
                <Input
                  className="h-10 w-20 rounded-xl text-center font-extrabold"
                  inputMode="decimal"
                  value={qty}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    if (!Number.isFinite(next)) return;
                    setQty(Math.max(unitMinQty(product.unit), next));
                  }}
                  onBlur={() => setQty((n) => normalizeQty(n, product.unit))}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="size-10 rounded-xl p-0"
                  onClick={() => setQty((n) => normalizeQty(n + unitStep(product.unit), product.unit))}
                >
                  +
                </Button>
                <span className="text-sm font-semibold text-muted-foreground">{unitWord}</span>
              </div>
              {product.sale_price != null ? (
                <p className="mt-2 text-[13px] font-semibold text-[#0B1F4D]">
                  {qty} {unitWord} × {formatNgn(Number(product.sale_price))} = {formatNgn(goodsTotal)}
                </p>
              ) : null}

              <p className="mt-4 text-sm font-bold">{t("shop.buy.fulfilment")}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button type="button" variant={fulfilment === "pickup" ? "default" : "outline"} className="rounded-xl" onClick={() => setFulfilment("pickup")}>
                  {t("shop.buy.pickup")}
                </Button>
                <Button type="button" variant={fulfilment === "seller_delivery" ? "default" : "outline"} className="rounded-xl" onClick={() => setFulfilment("seller_delivery")}>
                  Dispatch rider
                </Button>
              </div>

              {fulfilment === "seller_delivery" ? (
                <>
                  <label className="mt-4 block text-sm font-bold">Pickup destination</label>
                  <Input className="mt-1 min-h-11 rounded-xl" value={pickupAddress} onChange={(e) => setPickupAddress(e.target.value)} placeholder="Where should they collect from?" />
                  <label className="mt-3 block text-sm font-bold">Drop-off destination</label>
                  <Input className="mt-1 min-h-11 rounded-xl" value={dropoffAddress} onChange={(e) => setDropoffAddress(e.target.value)} placeholder="Where should they deliver to?" />
                </>
              ) : null}

              <label className="mt-4 block text-sm font-bold">{t("shop.buy.phone")}</label>
              <Input className="mt-1 min-h-11 rounded-xl" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("shop.buy.phonePlaceholder")} />
              <label className="mt-3 block text-sm font-bold">{t("shop.buy.note")}</label>
              <Input className="mt-1 min-h-11 rounded-xl" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("shop.buy.notePlaceholder")} />

              {deliveryFee > 0 ? (
                <div className="mt-5 flex justify-between text-sm">
                  <span className="text-muted-foreground">Dispatch rider</span>
                  <span className="font-bold">{formatNgn(deliveryFee)}</span>
                </div>
              ) : null}
              <div className="mt-2 flex justify-between text-sm">
                <span className="text-muted-foreground">{t("shop.buy.total")}</span>
                <span className="text-lg font-extrabold text-[#0B1F4D]">{formatNgn(total)}</span>
              </div>
              {!orderId ? (
                <Button
                  type="button"
                  className="mt-4 min-h-12 w-full rounded-xl bg-[#1F7A4D] font-extrabold"
                  disabled={busy}
                  onClick={() => void confirm()}
                >
                  {busy ? t("shop.buy.working") : t("shop.buy.placeTransfer")}
                </Button>
              ) : (
                <>
                  {paidNow ? (
                    <p className="mt-4 rounded-2xl bg-[#1F7A4D]/10 px-3 py-3 text-center text-sm font-extrabold text-[#1F7A4D]">
                      Paid for product
                    </p>
                  ) : (
                    <ShopPayPanel
                      businessId={product.business_id}
                      amount={total}
                      orderId={orderId}
                      kind="marketplace"
                      itemLabel={`${qty} ${unitWord} of ${product.name}`}
                      onPaid={() => {
                        setPaidNow(true);
                        void queryClient.invalidateQueries({ queryKey: ["marketplace-orders"] });
                      }}
                    />
                  )}
                  <Button className="mt-2 min-h-11 w-full rounded-xl" variant="outline" asChild>
                    <Link to="/shop/orders/$orderId" params={{ orderId }}>
                      {t("shop.buy.viewOrder")}
                    </Link>
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </MarketplaceShell>
  );
}
