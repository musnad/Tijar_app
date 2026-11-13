"use client";

import { useQuery } from "@tanstack/react-query";
import { MapPin, MessageCircle } from "lucide-react";

import { shopPlaceLabel } from "@/lib/maps/shop-coords";
import { displayNgPhone, paymentReceiptMessage, whatsappChatUrl } from "@/lib/whatsapp";
import { fetchShopPublicContact } from "@/services/marketplace-service";
import { displayShopName } from "@/lib/shop-names";
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
  if (query.isLoading) {
    return (
      <section className="rounded-2xl border border-[#1F7A4D]/25 bg-[#F4FBF7] p-4">
        <p className="text-sm font-extrabold text-[#0B1F4D]">Shop contact</p>
        <p className="mt-1 text-xs text-muted-foreground">Loading address and phone…</p>
      </section>
    );
  }
  if (!shop) return null;

  const shopName = displayShopName(shop.business_name);
  const address = shopPlaceLabel(shop);
  const phone = shop.public_whatsapp?.trim() || shop.public_phone?.trim() || "";
  const receipt = paymentReceiptMessage({
    shopName,
    orderRef,
    items: items || "Order",
    amountLabel: formatNgn(amount),
  });
  const href = phone ? whatsappChatUrl(phone, receipt) : null;

  return (
    <section className="rounded-2xl border border-[#1F7A4D]/25 bg-[#F4FBF7] p-4">
      <p className="text-sm font-extrabold text-[#0B1F4D]">Paid · shop details</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Tap the phone number to open WhatsApp with your payment receipt.
      </p>
      {address ? (
        <p className="mt-3 flex items-start gap-2 text-sm font-semibold text-[#0B1F4D]">
          <MapPin className="mt-0.5 size-4 shrink-0 text-[#1F7A4D]" />
          <span>{address}</span>
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">This shop has not added an address yet.</p>
      )}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 text-sm font-extrabold text-white"
        >
          <MessageCircle className="size-4" />
          {displayNgPhone(phone)}
        </a>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">This shop has not added a phone number yet.</p>
      )}
    </section>
  );
}
