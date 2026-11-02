"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Building2, Landmark } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { isMockFeedId } from "@/features/marketplace/feed-mock";
import { useAuth } from "@/features/auth/auth-context";
import {
  fetchBusinessPayoutAccount,
  fetchMarketplaceProduct,
  markBuyerTransferPaid,
  placeBuyNowOrder,
} from "@/services/marketplace-service";
import { formatNgn } from "@/utils/money";
import { useTranslation } from "@/lib/i18n/context";

export function BuyScreen({ productId }: { productId?: string }) {
  const { t } = useTranslation();
  const { profile, session } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [qty, setQty] = useState(1);
  const [fulfilment, setFulfilment] = useState<"pickup" | "seller_delivery">("pickup");
  const [phone, setPhone] = useState(profile?.phone ?? "");
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
  const accountQuery = useQuery({
    queryKey: ["payout-account", product?.business_id],
    enabled: Boolean(product?.business_id),
    queryFn: async () => (await fetchBusinessPayoutAccount(product!.business_id)).account,
  });
  const account = accountQuery.data;
  const hasAccount = Boolean(account?.payout_account_number);
  const total = product?.sale_price != null ? Number(product.sale_price) * qty + (fulfilment === "seller_delivery" ? 1500 : 0) : 0;

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
    if (!hasAccount) {
      toast.error(t("shop.buy.noAccount"));
      return;
    }
    setBusy(true);
    const placed = await placeBuyNowOrder({
      productId: product.id,
      quantity: qty,
      fulfilment,
      buyerNote: ["Pay: Transfer to shop", note].filter(Boolean).join(" · "),
      buyerPhone: phone,
      idempotencyKey: crypto.randomUUID(),
    });
    if (placed.error || !placed.order) {
      setBusy(false);
      toast.error(placed.error ?? "Could not place the order.");
      return;
    }
    setOrderId(placed.order.id);
    await queryClient.invalidateQueries({ queryKey: ["marketplace-orders"] });
    setBusy(false);
    toast.success(t("shop.buy.transferReady"));
  }

  async function paidNowClick() {
    if (!orderId) return;
    setBusy(true);
    const r = await markBuyerTransferPaid(orderId);
    setBusy(false);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    setPaidNow(true);
    toast.success(t("shop.buy.paidMarked"));
    await queryClient.invalidateQueries({ queryKey: ["marketplace-orders"] });
  }

  return (
    <MarketplaceShell hideTopBar variant="feed">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
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
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.image_url} alt="" className="size-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold text-[#0B1F4D]">{product.name}</p>
                  <p className="text-sm text-muted-foreground">{product.business_name}</p>
                  <p className="mt-1 font-extrabold text-[#1F7A4D]">{formatNgn(Number(product.sale_price))}</p>
                </div>
              </div>

              <label className="mt-4 block text-sm font-bold">{t("shop.buy.quantity")}</label>
              <div className="mt-1 flex items-center gap-2">
                <Button type="button" variant="outline" className="size-10 rounded-xl p-0" onClick={() => setQty((n) => Math.max(1, n - 1))}>
                  −
                </Button>
                <span className="w-8 text-center font-extrabold">{qty}</span>
                <Button type="button" variant="outline" className="size-10 rounded-xl p-0" onClick={() => setQty((n) => n + 1)}>
                  +
                </Button>
              </div>

              <p className="mt-4 text-sm font-bold">{t("shop.buy.fulfilment")}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button type="button" variant={fulfilment === "pickup" ? "default" : "outline"} className="rounded-xl" onClick={() => setFulfilment("pickup")}>
                  {t("shop.buy.pickup")}
                </Button>
                <Button type="button" variant={fulfilment === "seller_delivery" ? "default" : "outline"} className="rounded-xl" onClick={() => setFulfilment("seller_delivery")}>
                  {t("shop.buy.delivery")}
                </Button>
              </div>

              <label className="mt-4 block text-sm font-bold">{t("shop.buy.phone")}</label>
              <Input className="mt-1 min-h-11 rounded-xl" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("shop.buy.phonePlaceholder")} />
              <label className="mt-3 block text-sm font-bold">{t("shop.buy.note")}</label>
              <Input className="mt-1 min-h-11 rounded-xl" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("shop.buy.notePlaceholder")} />

              <p className="mt-5 text-sm font-extrabold text-[#0B1F4D]">{t("shop.buy.payHow")}</p>
              <div className="mt-2 flex w-full items-start gap-3 rounded-2xl border border-primary bg-primary/5 p-3 text-left">
                <Landmark className="mt-0.5 size-5 text-primary" />
                <span>
                  <span className="block text-sm font-extrabold">{t("shop.buy.transfer")}</span>
                  <span className="mt-0.5 block text-[12px] text-muted-foreground">{t("shop.buy.transferHint")}</span>
                </span>
              </div>

              <div className="mt-3 rounded-2xl border border-[#EEF1F5] bg-[#F8FAFC] p-3 text-sm">
                <p className="flex items-center gap-1.5 font-extrabold text-[#0B1F4D]">
                  <Building2 className="size-4" />
                  {t("shop.buy.shopAccount")}
                </p>
                {accountQuery.isLoading ? (
                  <p className="mt-2 text-muted-foreground">Loading account…</p>
                ) : hasAccount ? (
                  <dl className="mt-2 space-y-1 text-[13px]">
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">{t("shop.buy.bank")}</dt>
                      <dd className="font-bold">{account?.payout_bank_name}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">{t("shop.buy.accountName")}</dt>
                      <dd className="font-bold">{account?.payout_account_name}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">{t("shop.buy.accountNumber")}</dt>
                      <dd className="font-extrabold tracking-wide">{account?.payout_account_number}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-2 text-[13px] text-muted-foreground">{t("shop.buy.noAccount")}</p>
                )}
              </div>

              <div className="mt-5 flex justify-between text-sm">
                <span className="text-muted-foreground">{t("shop.buy.total")}</span>
                <span className="text-lg font-extrabold text-[#0B1F4D]">{formatNgn(total)}</span>
              </div>
              {!orderId ? (
                <Button
                  type="button"
                  className="mt-4 min-h-12 w-full rounded-xl bg-[#1F7A4D] font-extrabold"
                  disabled={busy || !hasAccount}
                  onClick={() => void confirm()}
                >
                  {busy ? t("shop.buy.working") : t("shop.buy.placeTransfer")}
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    className="mt-4 min-h-12 w-full rounded-xl bg-[#1F7A4D] font-extrabold"
                    disabled={busy || paidNow}
                    onClick={() => void paidNowClick()}
                  >
                    {paidNow ? t("shop.buy.paidMarked") : busy ? t("shop.buy.working") : t("shop.buy.paidNow")}
                  </Button>
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
