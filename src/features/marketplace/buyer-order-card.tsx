import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { OrderTrackTimeline } from "@/features/marketplace/order-track-timeline";
import { cn } from "@/lib/utils";
import { formatNgn } from "@/utils/money";
import {
  formatOrderWhen,
  orderStatusHint,
  orderStatusLabel,
  orderStatusTone,
  placeOrderTrackStatus,
} from "@/utils/order-tracking";

function badgeClass(status: string): string {
  const tone = orderStatusTone(placeOrderTrackStatus(status));
  if (tone === "active") return "bg-primary/15 text-primary";
  if (tone === "done") return "bg-[#1F7A4D]/12 text-[#1F7A4D]";
  if (tone === "warn") return "bg-destructive/10 text-destructive";
  return "bg-muted text-muted-foreground";
}

export function BuyerOrderCard({
  orderId,
  listingId,
  title,
  subtitle,
  total,
  status,
  fulfilment,
  createdAt,
  imageUrl,
  footer,
}: {
  orderId?: string;
  listingId?: string;
  title: string;
  subtitle?: string;
  total: number;
  status: string;
  fulfilment: string;
  createdAt: string;
  imageUrl?: string | null;
  footer?: ReactNode;
}) {
  const trackStatus = placeOrderTrackStatus(status);
  const inner = (
    <>
      <div className="flex items-start gap-3">
        {imageUrl ? (
          <span className="size-14 shrink-0 overflow-hidden rounded-xl bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="" className="size-full object-cover" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-bold text-[#0B1F4D]">{title}</p>
              {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
              <p className="mt-0.5 text-[11px] text-muted-foreground">{formatOrderWhen(createdAt)}</p>
            </div>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", badgeClass(status))}>
              {orderStatusLabel(status)}
            </span>
          </div>
        </div>
      </div>
      <OrderTrackTimeline status={trackStatus} fulfilment={fulfilment} compact />
      <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{orderStatusHint(status)}</p>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-sm font-extrabold text-primary">{formatNgn(Number(total))}</p>
        {orderId || listingId ? (
          <span className="inline-flex items-center gap-0.5 text-xs font-bold text-primary">
            Track <ChevronRight className="size-3.5" />
          </span>
        ) : null}
      </div>
    </>
  );

  return (
    <li className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      {orderId ? (
        <Link to="/shop/orders/$orderId" params={{ orderId }} className="block">
          {inner}
        </Link>
      ) : listingId ? (
        <Link to="/shop/order-now/$listingId" params={{ listingId }} className="block">
          {inner}
        </Link>
      ) : (
        inner
      )}
      {footer}
    </li>
  );
}
