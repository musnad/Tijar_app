"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { AppPageHeader } from "@/features/app-layout/app-page-header";
import { canSellerTransition } from "@/lib/checkout/order-status";
import { fetchSellerOrders } from "@/services/seller-dashboard-service";
import { fetchShopPlaceOrders, placeOrderPayLabel, placeOrderStatusLabel } from "@/services/place-order-service";
import { transitionOrder } from "@/services/marketplace-service";
import { formatNgn } from "@/utils/money";
import { orderStatusLabel } from "@/utils/order-tracking";

/** The next step a shop takes on an order, depending on how it is fulfilled. */
function nextSellerStatus(status: string, fulfilment: string): string | null {
  if (status === "pending_payment") return "confirmed";
  if (status === "confirmed") return "processing";
  if (status === "processing") return fulfilment === "pickup" ? "ready_for_pickup" : "shipped";
  if (status === "shipped" || status === "ready_for_pickup") return "delivered";
  return null;
}

/** Plain-language label for the shop's next-step button. */
function nextSellerLabel(status: string, fulfilment: string): string {
  if (status === "pending_payment") return "Confirm payment";
  if (status === "confirmed") return "Start preparing";
  if (status === "processing") {
    return fulfilment === "pickup" ? "Mark ready for pickup" : "Mark out for delivery";
  }
  if (status === "ready_for_pickup") return "Mark collected";
  if (status === "shipped") return "Mark delivered";
  return "Update";
}

/** Confirmation shown to the shop after each step. */
function orderMoveMessage(status: string): string {
  if (status === "confirmed") return "Payment confirmed — recorded in today’s sales";
  if (status === "processing") return "Order marked as being prepared";
  if (status === "shipped") return "Order marked out for delivery";
  if (status === "ready_for_pickup") return "Order marked ready for pickup";
  if (status === "delivered") return "Order completed — customer notified";
  if (status === "cancelled") return "Order cancelled — customer notified";
  return "Status updated";
}

export function SellerOrdersInboxScreen({ businessId }: { businessId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["seller-orders", businessId],
    refetchInterval: 30_000,
    queryFn: async () => {
      const r = await fetchSellerOrders(businessId);
      if (r.error) throw new Error(r.error);
      return r.orders;
    },
  });
  const placeQuery = useQuery({
    queryKey: ["place-order-shop", businessId],
    queryFn: async () => (await fetchShopPlaceOrders(businessId)).orders,
  });

  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => transitionOrder(id, status),
    onSuccess: async (r, vars) => {
      if (r.error) toast.error(r.error);
      else {
        toast.success(orderMoveMessage(vars.status));
        await queryClient.invalidateQueries({ queryKey: ["seller-orders", businessId] });
        await queryClient.invalidateQueries({ queryKey: ["transactions"] });
        await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      }
    },
  });

  return (
    <>
      <AppPageHeader
        title="Marketplace orders"
        subtitle="When a customer taps Paid now, confirm the transfer. That records it in today’s sales."
      />
      {query.isLoading && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}
      {(query.data?.length ?? 0) === 0 && (placeQuery.data?.length ?? 0) === 0 && !query.isLoading && (
        <p className="mt-4 text-sm text-muted-foreground">No order requests yet.</p>
      )}
      {(placeQuery.data?.length ?? 0) > 0 ? (
        <ul className="mt-4 space-y-3">
          {(placeQuery.data ?? []).map((order) => {
            const paid = placeOrderPayLabel(order.status) === "Paid";
            return (
              <li key={order.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{order.listing_title ?? "Place your order"}</p>
                    <p className="text-xs text-muted-foreground">{placeOrderStatusLabel(order.status)}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${paid ? "bg-[#1F7A4D]/12 text-[#1F7A4D]" : "bg-amber-100 text-amber-900"}`}>
                    {placeOrderPayLabel(order.status)}
                  </span>
                </div>
                <p className="mt-2 text-sm font-bold">{order.buyer_name ?? "Customer"}</p>
                <p className="text-xs text-muted-foreground">
                  {order.fulfilment === "delivery" ? "Delivery" : "Pickup"} · {order.quantity} · {order.slot_time}
                </p>
                <p className="mt-1 text-sm font-extrabold text-primary">{formatNgn(order.total)}</p>
                <p className="mt-2 text-xs font-semibold">Phone {order.buyer_phone || "not given"}</p>
                {order.fulfilment === "delivery" ? (
                  <p className="text-xs">Deliver to {order.delivery_address || "no address yet"}</p>
                ) : (
                  <p className="text-xs">Customer will pick up</p>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
      <ul className="mt-4 space-y-3">
        {(query.data ?? []).map((o) => {
          const next = nextSellerStatus(o.status, o.fulfilment);
          const canCancel = o.status === "pending_payment" || o.status === "confirmed";
          return (
            <li key={o.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold">{o.order_number}</p>
                  <p className="text-xs text-muted-foreground">
                    {orderStatusLabel(o.status)} · {o.fulfilment === "pickup" ? "Pickup" : "Delivery"}
                  </p>
                </div>
                <p className="font-extrabold text-primary">{formatNgn(Number(o.total))}</p>
              </div>
              {o.buyer_note ? <p className="mt-2 text-xs text-muted-foreground">{o.buyer_note}</p> : null}
              {o.buyer_marked_paid_at && o.status === "pending_payment" ? (
                <p className="mt-2 rounded-xl bg-[#1F7A4D]/10 px-3 py-2 text-xs font-bold text-[#1F7A4D]">
                  Customer tapped Paid now — confirm if the money is in your account.
                </p>
              ) : null}
              {o.sale_transaction_id ? (
                <p className="mt-1 text-[11px] font-semibold text-[#1F7A4D]">Recorded in daily sales</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {next && canSellerTransition(o.status, next) && (
                  <Button
                    size="sm"
                    className="rounded-xl"
                    disabled={move.isPending}
                    onClick={() => move.mutate({ id: o.id, status: next })}
                  >
                    {nextSellerLabel(o.status, o.fulfilment)}
                  </Button>
                )}
                {canCancel && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-xl"
                    disabled={move.isPending}
                    onClick={() => move.mutate({ id: o.id, status: "cancelled" })}
                  >
                    Cancel order
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
