"use client";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Package, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { OrderTrackTimeline } from "@/features/marketplace/order-track-timeline";
import { useAuth } from "@/features/auth/auth-context";
import { fetchMyOrders } from "@/services/marketplace-service";
import { formatNgn } from "@/utils/money";
import {
  formatOrderWhen,
  isActiveOrder,
  isDoneOrder,
  orderStatusLabel,
  orderStatusTone,
} from "@/utils/order-tracking";
import { cn } from "@/lib/utils";

type Tab = "active" | "completed" | "all";

function statusBadgeClass(status: string): string {
  const tone = orderStatusTone(status);
  if (tone === "active") return "bg-primary/15 text-primary";
  if (tone === "done") return "bg-primary/15 text-primary";
  if (tone === "warn") return "bg-destructive/10 text-destructive";
  return "bg-muted text-muted-foreground";
}

export function OrdersScreen() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>("active");
  const [query, setQuery] = useState("");

  const ordersQuery = useQuery({
    queryKey: ["marketplace-orders", profile?.id ?? "guest"],
    queryFn: async () => {
      const res = await fetchMyOrders(profile?.id ?? "guest");
      if (res.error) throw new Error(res.error);
      return res.orders;
    },
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (ordersQuery.data ?? []).filter((o) => {
      if (tab === "active" && !isActiveOrder(o.status)) return false;
      if (tab === "completed" && !isDoneOrder(o.status)) return false;
      if (!q) return true;
      return o.order_number.toLowerCase().includes(q) || o.status.toLowerCase().includes(q);
    });
  }, [ordersQuery.data, tab, query]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "active", label: "Active" },
    { id: "completed", label: "Done" },
    { id: "all", label: "All" },
  ];

  return (
    <MarketplaceShell>
      <h1 className="text-xl font-extrabold">My orders</h1>
      <p className="mt-1 text-sm text-muted-foreground">Track payment, preparation, and delivery.</p>

      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search order number…"
          className="min-h-11 rounded-xl pl-9"
          aria-label="Search orders"
        />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl border border-border bg-muted/40 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-lg py-2 text-xs font-bold",
              tab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {ordersQuery.isLoading && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}
      {ordersQuery.isError && (
        <p className="mt-4 text-sm text-destructive">
          Could not load orders. Apply the marketplace migration in Supabase.
        </p>
      )}
      {!ordersQuery.isLoading && filtered.length === 0 && (
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-card p-6 text-center">
          <Package className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-2 font-semibold">
            {tab === "active" ? "No active orders" : "No orders here"}
          </p>
          <Link to="/shop" className="mt-3 inline-block text-sm font-bold text-primary">
            Browse marketplace
          </Link>
        </div>
      )}

      <ul className="mt-4 space-y-3">
        {filtered.map((o) => (
          <li key={o.id}>
            <Link
              to="/shop/orders/$orderId"
              params={{ orderId: o.id }}
              className="block rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/30"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold">{o.order_number}</p>
                  <p className="text-xs text-muted-foreground">{formatOrderWhen(o.created_at)}</p>
                  <p className="mt-0.5 text-[11px] capitalize text-muted-foreground">
                    {o.fulfilment.replace(/_/g, " ")}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                    statusBadgeClass(o.status),
                  )}
                >
                  {orderStatusLabel(o.status)}
                </span>
              </div>
              <OrderTrackTimeline status={o.status} fulfilment={o.fulfilment} compact />
              <div className="mt-2 flex items-center justify-between">
                <p className="text-sm font-extrabold text-primary">{formatNgn(Number(o.total))}</p>
                <span className="inline-flex items-center gap-0.5 text-xs font-bold text-primary">
                  Details <ChevronRight className="size-3.5" />
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </MarketplaceShell>
  );
}
