"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Package, Search, ShoppingCart } from "lucide-react";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { NativePageHeader, nativeCanvasClass } from "@/features/marketplace/native-page-header";
import { BuyerOrderCard } from "@/features/marketplace/buyer-order-card";
import { useAuth } from "@/features/auth/auth-context";
import { Button } from "@/components/ui/button";
import { canBuyerMarkPlaceOrderReceived, canBuyerMarkReceived } from "@/lib/checkout/delivery-fee";
import { fetchMyOrders, transitionOrder } from "@/services/marketplace-service";
import { fetchMyPlaceOrders, markPlaceOrderReceived } from "@/services/place-order-service";
import { toast } from "sonner";
import { isActiveOrder, isDoneOrder, placeOrderTrackStatus } from "@/utils/order-tracking";
import { cn } from "@/lib/utils";

type Tab = "active" | "completed" | "all";

export function OrdersScreen() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");

  const ordersQuery = useQuery({
    queryKey: ["marketplace-orders", profile?.id ?? "guest"],
    queryFn: async () => {
      const res = await fetchMyOrders(profile?.id ?? "guest");
      if (res.error) throw new Error(res.error);
      return res.orders;
    },
  });

  const placeQuery = useQuery({
    queryKey: ["place-order-mine", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => (await fetchMyPlaceOrders(profile!.id)).orders,
  });

  const marketRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (ordersQuery.data ?? []).filter((o) => {
      if (tab === "active" && !isActiveOrder(o.status)) return false;
      if (tab === "completed" && !isDoneOrder(o.status)) return false;
      if (!q) return true;
      return o.order_number.toLowerCase().includes(q) || o.status.toLowerCase().includes(q);
    });
  }, [ordersQuery.data, tab, query]);

  const placeRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (placeQuery.data ?? []).filter((order) => {
      const mapped = placeOrderTrackStatus(order.status);
      if (tab === "active" && !isActiveOrder(mapped)) return false;
      if (tab === "completed" && !isDoneOrder(mapped)) return false;
      if (!q) return true;
      return (
        (order.listing_title ?? "").toLowerCase().includes(q) ||
        (order.shop_name ?? "").toLowerCase().includes(q) ||
        order.status.toLowerCase().includes(q)
      );
    });
  }, [placeQuery.data, tab, query]);

  const empty = marketRows.length === 0 && placeRows.length === 0;
  const tabs: { id: Tab; label: string }[] = [
    { id: "all", label: "All" },
    { id: "active", label: "On the way" },
    { id: "completed", label: "Done" },
  ];

  return (
    <MarketplaceShell hideTopBar variant="feed">
      <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", nativeCanvasClass())}>
        <NativePageHeader title="My orders" subtitle="Every order, with a simple tracker." showBack />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search shop or order number…"
              className="min-h-11 rounded-full pl-9"
              aria-label="Search orders"
            />
          </div>

          <div className="mt-3 grid grid-cols-3 gap-1 rounded-full border border-border bg-white p-1 shadow-[0_4px_14px_rgba(11,31,58,0.06)]">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "rounded-full py-2 text-xs font-bold",
                  tab === t.id ? "bg-[#0B1F3A] text-white shadow-sm" : "text-muted-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {ordersQuery.isLoading && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}
          {ordersQuery.isError && (
            <p className="mt-4 text-sm text-destructive">Could not load orders. Try again in a moment.</p>
          )}
          {!ordersQuery.isLoading && empty && (
            <div className="mt-4 rounded-2xl border border-dashed border-border bg-card p-6 text-center">
              <Package className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-2 font-semibold">{tab === "active" ? "Nothing on the way" : "No orders here"}</p>
              <p className="mt-1 text-sm text-muted-foreground">Add items to cart, then check out — they land on this page.</p>
              <div className="mt-3 flex justify-center gap-2">
                <Link to="/shop" className="text-sm font-bold text-primary">
                  Browse marketplace
                </Link>
                <Link to="/shop/cart" className="inline-flex items-center gap-1 text-sm font-bold text-primary">
                  <ShoppingCart className="size-3.5" /> Cart
                </Link>
              </div>
            </div>
          )}

          <ul className="mt-4 space-y-3">
            {placeRows.map((order) => (
              <BuyerOrderCard
                key={`place-${order.id}`}
                listingId={order.listing_id}
                title={order.listing_title ?? "Place your order"}
                subtitle={order.shop_name}
                total={Number(order.total)}
                status={order.status}
                fulfilment={order.fulfilment}
                createdAt={order.created_at}
                imageUrl={order.listing_image}
                footer={
                  canBuyerMarkPlaceOrderReceived(order.status) ? (
                    <Button
                      type="button"
                      className="mt-3 min-h-10 w-full rounded-xl bg-[#1F7A4D] text-xs font-extrabold text-white"
                      onClick={async (e) => {
                        e.preventDefault();
                        const r = await markPlaceOrderReceived(order.id);
                        if (r.error) toast.error(r.error);
                        else {
                          toast.success("Marked as received.");
                          await queryClient.invalidateQueries({ queryKey: ["place-order-mine"] });
                          await queryClient.invalidateQueries({ queryKey: ["marketplace-orders"] });
                        }
                      }}
                    >
                      I received this
                    </Button>
                  ) : null
                }
              />
            ))}
            {marketRows.map((o) => (
              <BuyerOrderCard
                key={o.id}
                orderId={o.id}
                title={o.order_number}
                subtitle={o.fulfilment.replace(/_/g, " ")}
                total={Number(o.total)}
                status={o.status}
                fulfilment={o.fulfilment}
                createdAt={o.created_at}
                footer={
                  canBuyerMarkReceived(o.status) ? (
                    <Button
                      type="button"
                      className="mt-3 min-h-10 w-full rounded-xl bg-[#1F7A4D] text-xs font-extrabold text-white"
                      onClick={async () => {
                        const r = await transitionOrder(o.id, "delivered");
                        if (r.error) toast.error(r.error);
                        else {
                          toast.success("Marked as received.");
                          await queryClient.invalidateQueries({ queryKey: ["marketplace-orders"] });
                        }
                      }}
                    >
                      I received this
                    </Button>
                  ) : null
                }
              />
            ))}
          </ul>
        </div>
      </div>
    </MarketplaceShell>
  );
}
