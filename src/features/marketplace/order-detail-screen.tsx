"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, MapPin, Phone } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { OrderTrackTimeline } from "@/features/marketplace/order-track-timeline";
import { ShopPayPanel } from "@/features/marketplace/shop-pay-panel";
import { useAuth } from "@/features/auth/auth-context";
import {
  fetchOrderDetail,
  transitionOrder,
} from "@/services/marketplace-service";
import { formatNgn } from "@/utils/money";
import { formatOrderWhen, orderStatusLabel } from "@/utils/order-tracking";

export function OrderDetailScreen({ orderId }: { orderId: string }) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const detailQuery = useQuery({
    queryKey: ["marketplace-order", orderId, profile?.id ?? "guest"],
    queryFn: async () => {
      const res = await fetchOrderDetail(orderId, profile?.id ?? "guest");
      if (res.error) throw new Error(res.error);
      return res;
    },
  });

  const order = detailQuery.data?.order;
  const items = detailQuery.data?.items ?? [];
  const awaitingPay = order?.status === "pending_payment";
  const buyerSaidPaid = Boolean(order?.buyer_marked_paid_at);
  const itemLabel = items.map((i) => `${i.quantity} × ${i.product_name}`).join(", ") || "an order";

  return (
    <MarketplaceShell>
      <Link
        to="/shop/orders"
        className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground"
      >
        <ArrowLeft className="size-4" /> All orders
      </Link>

      {detailQuery.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {detailQuery.isError && (
        <p className="text-sm text-destructive">Could not load this order.</p>
      )}
      {!detailQuery.isLoading && !order && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center">
          <p className="font-semibold">Order not found</p>
          <Button className="mt-4 rounded-xl font-bold" asChild>
            <Link to="/shop/orders">Back to orders</Link>
          </Button>
        </div>
      )}

      {order && (
        <div className="space-y-4 pb-6">
          <div className="dashboard-summary-card rounded-2xl p-4 text-primary-foreground shadow-lg">
            <p className="text-[11px] font-bold uppercase tracking-wide text-white/70">
              Order tracking
            </p>
            <h1 className="mt-1 text-xl font-extrabold">{order.order_number}</h1>
            <p className="mt-1 text-sm text-white/85">
              {order.is_order_request !== false && order.status === "pending_payment"
                ? "Order request — not paid"
                : orderStatusLabel(order.status)}
            </p>
            <p className="mt-3 text-2xl font-extrabold">{formatNgn(Number(order.total))}</p>
            <p className="mt-1 text-xs text-white/75">{formatOrderWhen(order.created_at)}</p>
          </div>

          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h2 className="text-sm font-extrabold">Status</h2>
            <div className="mt-3">
              <OrderTrackTimeline status={order.status} fulfilment={order.fulfilment} />
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h2 className="text-sm font-extrabold">Fulfilment</h2>
            <p className="mt-1 flex items-center gap-2 text-sm capitalize text-muted-foreground">
              <MapPin className="size-4 shrink-0 text-primary" />
              {order.fulfilment.replace(/_/g, " ")}
            </p>
            {order.buyer_phone && (
              <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="size-4 shrink-0 text-primary" />
                {order.buyer_phone}
              </p>
            )}
            {order.buyer_note && (
              <p className="mt-2 rounded-xl bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                Note: {order.buyer_note}
              </p>
            )}
          </section>

          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-extrabold">Items ({items.length})</h2>
            </div>
            <ul className="divide-y divide-border">
              {items.map((i) => (
                <li key={i.id} className="flex gap-3 px-4 py-3">
                  <div className="size-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                    {i.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={i.image_url} alt="" className="size-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{i.product_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.quantity} {i.unit} · {formatNgn(Number(i.unit_price))} each
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-primary">
                    {formatNgn(Number(i.line_total))}
                  </p>
                </li>
              ))}
            </ul>
            <div className="space-y-1 border-t border-border px-4 py-3 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatNgn(Number(order.subtotal))}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Delivery</span>
                <span>{formatNgn(Number(order.delivery_fee))}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Payment charges</span>
                <span>{formatNgn(Number(order.payment_fee ?? 0))}</span>
              </div>
              <div className="flex justify-between pt-1 text-base font-extrabold">
                <span>Total</span>
                <span className="text-primary">{formatNgn(Number(order.total))}</span>
              </div>
            </div>
          </section>

          {awaitingPay && order.business_id ? (
            buyerSaidPaid || order.status === "paid" ? (
              <p className="rounded-2xl bg-[#1F7A4D]/10 px-3 py-3 text-center text-sm font-extrabold text-[#1F7A4D]">
                Paid · ordered
              </p>
            ) : (
              <ShopPayPanel
                businessId={order.business_id}
                amount={Number(order.total)}
                orderId={order.id}
                kind="marketplace"
                itemLabel={itemLabel}
                onPaid={() => {
                  void queryClient.invalidateQueries({ queryKey: ["marketplace-order", orderId] });
                  void queryClient.invalidateQueries({ queryKey: ["marketplace-orders"] });
                }}
              />
            )
          ) : null}

          {order.status === "pending_payment" && (
            <Button
              type="button"
              variant="outline"
              className="min-h-12 w-full rounded-xl font-bold"
              onClick={async () => {
                const r = await transitionOrder(order.id, "cancelled");
                if (r.error) toast.error(r.error);
                else {
                  toast.success("Request cancelled");
                  await queryClient.invalidateQueries({ queryKey: ["marketplace-order", orderId] });
                  await queryClient.invalidateQueries({ queryKey: ["marketplace-orders"] });
                }
              }}
            >
              Cancel request
            </Button>
          )}
          <Button className="min-h-12 w-full rounded-xl font-bold" asChild>
            <Link to="/shop">Continue shopping</Link>
          </Button>
        </div>
      )}
    </MarketplaceShell>
  );
}
