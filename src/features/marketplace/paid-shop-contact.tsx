"use client";

import { useQuery } from "@tanstack/react-query";
import { MapPin, MessageCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { shopPlaceLabel } from "@/lib/maps/shop-coords";
import { dataUrlToFile } from "@/lib/marketing/resize-image";
import { composePaymentReceipt, receiptShareCaption } from "@/lib/receipt/compose-receipt";
import { displayShopName } from "@/lib/shop-names";
import { displayNgPhone, whatsappChatUrl } from "@/lib/whatsapp";
import { fetchShopPublicContact } from "@/services/marketplace-service";
import { formatNgn } from "@/utils/money";

export function orderShowsShopContact(status: string, buyerMarkedPaidAt?: string | null): boolean {
  if (buyerMarkedPaidAt) return true;
  return ["paid", "confirmed", "processing", "shipped", "ready_for_pickup", "delivered"].includes(status);
}

export function PaidShopContact({
  businessId,
  orderRef,
  items,
  amount,
}: {
  businessId: string;
  orderRef: string;
  items: string;
  amount: number;
}) {
  const query = useQuery({
    queryKey: ["shop-public-contact", businessId],
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await fetchShopPublicContact(businessId);
      if (res.error && !res.shop) throw new Error(res.error);
      return res.shop;
    },
    staleTime: 60_000,
  });

  const shop = query.data;
  const shopName = displayShopName(shop?.business_name);
  const address = shop ? shopPlaceLabel(shop) : "";
  const amountLabel = formatNgn(amount);
  const receiptInput = useMemo(
    () => ({
      shopName,
      shopAddress: address,
      orderRef,
      items: items || "Order",
      amountLabel,
    }),
    [address, amountLabel, items, orderRef, shopName],
  );

  const [receiptSrc, setReceiptSrc] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (!shop) return;
    let live = true;
    void composePaymentReceipt(receiptInput)
      .then((src) => {
        if (live) setReceiptSrc(src);
      })
      .catch(() => {
        if (live) setReceiptSrc(null);
      });
    return () => {
      live = false;
    };
  }, [receiptInput, shop]);

  if (query.isLoading) {
    return (
      <section className="rounded-2xl border border-[#1F7A4D]/25 bg-[#F4FBF7] p-4">
        <p className="text-sm font-extrabold text-[#0B1F4D]">Shop contact</p>
        <p className="mt-1 text-xs text-muted-foreground">Loading address and phone…</p>
      </section>
    );
  }
  if (!shop) return null;

  const phone = shop.public_whatsapp?.trim() || shop.public_phone?.trim() || "";
  const caption = receiptShareCaption(receiptInput);
  const chatUrl = phone ? whatsappChatUrl(phone, caption) : null;

  async function shareReceipt() {
    if (!phone || !chatUrl) {
      toast.message("This shop has not added a phone number yet.");
      return;
    }
    setSharing(true);
    try {
      const src = receiptSrc ?? (await composePaymentReceipt(receiptInput));
      if (!receiptSrc) setReceiptSrc(src);
      const file = dataUrlToFile(src, `TIJAR-receipt-${orderRef.replace(/[^\w-]+/g, "")}.jpg`);
      const payload = { files: [file], title: "TIJAR.ng receipt", text: caption };
      const canFiles =
        typeof navigator !== "undefined" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });
      if (canFiles && typeof navigator.share === "function") {
        await navigator.share(payload);
        toast.success("Pick WhatsApp and send the TIJAR receipt to the shop.");
        return;
      }
      const link = document.createElement("a");
      link.href = src;
      link.download = file.name;
      link.click();
      window.open(chatUrl, "_blank", "noopener,noreferrer");
      toast.success("Receipt saved. WhatsApp is open — attach the TIJAR receipt image.");
    } catch (err) {
      if (err instanceof Error && /abort|cancel/i.test(err.message)) return;
      if (chatUrl) window.open(chatUrl, "_blank", "noopener,noreferrer");
    } finally {
      setSharing(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[#1F7A4D]/25 bg-[#F4FBF7] p-4">
      <p className="text-sm font-extrabold text-[#0B1F4D]">Paid · TIJAR receipt</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Branded tijar.ng receipt for this shop. Tap the number to send it on WhatsApp.
      </p>
      {receiptSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={receiptSrc}
          alt={`TIJAR.ng payment receipt for ${shopName}`}
          className="mt-3 w-full overflow-hidden rounded-2xl border border-[#0B1F4D]/10 shadow-sm"
        />
      ) : (
        <div className="mt-3 rounded-2xl bg-[#0B1F4D] px-4 py-8 text-center text-white">
          <p className="text-lg font-extrabold tracking-wide">TIJAR</p>
          <p className="text-xs font-bold text-[#8CFFC4]">tijar.ng</p>
          <p className="mt-3 text-sm font-semibold">{shopName}</p>
          <p className="mt-1 text-xs text-white/70">{orderRef}</p>
          <p className="mt-2 text-xl font-extrabold text-[#8CFFC4]">{amountLabel}</p>
        </div>
      )}
      {address ? (
        <p className="mt-3 flex items-start gap-2 text-sm font-semibold text-[#0B1F4D]">
          <MapPin className="mt-0.5 size-4 shrink-0 text-[#1F7A4D]" />
          <span>{address}</span>
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">This shop has not added an address yet.</p>
      )}
      {chatUrl ? (
        <button
          type="button"
          onClick={() => void shareReceipt()}
          disabled={sharing}
          className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 text-sm font-extrabold text-white"
        >
          <MessageCircle className="size-4" />
          {sharing ? "Opening WhatsApp…" : displayNgPhone(phone)}
        </button>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">This shop has not added a phone number yet.</p>
      )}
    </section>
  );
}
