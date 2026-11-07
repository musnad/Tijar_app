"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { AppPageHeader } from "@/features/app-layout/app-page-header";
import { canSellerTransition } from "@/lib/checkout/order-status";
import { fetchSellerOrders } from "@/services/seller-dashboard-service";
import { fetchShopPlaceOrders, placeOrderPayLabel, placeOrderStatusLabel } from "@/services/place-order-service";
import { transitionOrder } from "@/services/marketplace-service";
import { SellerFeePreview, SellerFeeResult } from "@/features/marketplace/seller-fee-preview";
import { formatNgn } from "@/utils/money";
import { orderStatusLabel } from "@/utils/order-tracking";

export function SellerOrdersInboxScreen({ businessId }: { businessId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["seller-orders", businessId],
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
        toast.success(vars.status === "confirmed" ? "Confirmed — recorded in today’s sales" : "Status updated");
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
                {paid ? (
                  <SellerFeeResult gross={Number(order.total)} fee={order.platform_fee_ngn} net={order.seller_net_ngn} />
                ) : (
                  <SellerFeePreview price={Number(order.total)} />
                )}
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
          const next =
            o.status === "pending_payment"
              ? "confirmed"
              : o.status === "confirmed"
                ? "processing"
                : o.status === "processing"
                  ? "ready_for_pickup"
                  : null;
          return (
            <li key={o.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold">{o.order_number}</p>
                  <p className="text-xs text-muted-foreground">{orderStatusLabel(o.status)}</p>
                </div>
                <p className="font-extrabold text-primary">{formatNgn(Number(o.total))}</p>
              </div>
              {o.status === "paid" || o.buyer_marked_paid_at ? (
                <SellerFeeResult gross={Number(o.total)} fee={o.platform_fee_ngn} net={o.seller_net_ngn} />
              ) : (
                <SellerFeePreview price={Number(o.total)} />
              )}
              {o.buyer_note ? <p className="mt-2 text-xs text-muted-foreground">{o.buyer_note}</p> : null}
              {o.buyer_marked_paid_at && o.status === "pending_payment" ? (
                <p className="mt-2 rounded-xl bg-[#1F7A4D]/10 px-3 py-2 text-xs font-bold text-[#1F7A4D]">
                  Customer tapped Paid now — confirm if the money is in your account.
                </p>
              ) : null}
              {o.sale_transaction_id ? (
                <p className="mt-1 text-[11px] font-semibold text-[#1F7A4D]">Recorded in daily sales</p>
              ) : null}
              {next && canSellerTransition(o.status, next) && (
                <Button
                  size="sm"
                  className="mt-3 rounded-xl"
                  disabled={move.isPending}
                  onClick={() => move.mutate({ id: o.id, status: next })}
                >
                  {o.status === "pending_payment"
                    ? "Confirm payment"
                    : `Mark ${orderStatusLabel(next)}`}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
