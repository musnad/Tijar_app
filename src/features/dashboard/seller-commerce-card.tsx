"use client";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Inbox, Package, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Business } from "@/types/database";
import { fetchSellerWallet } from "@/services/marketplace-service";
import { fetchMyBusinessIds, fetchShopInbox } from "@/services/shop-chat-service";
import { useAuth } from "@/features/auth/auth-context";
import { cn } from "@/lib/utils";

export function SellerCommerceCard({
  business,
  recentOrderCount,
  enquiryCount,
}: {
  business: Business;
  completeness?: { score: number; missing: string[] };
  publishedProducts?: number;
  videoCounts?: { published: number; draft: number; pending_moderation: number };
  analytics?: unknown;
  analyticsReady?: boolean;
  recentOrderCount: number;
  enquiryCount: number;
}) {
  const { profile } = useAuth();
  const walletQuery = useQuery({
    queryKey: ["seller-wallet", business.id],
    queryFn: async () => (await fetchSellerWallet(business.id)).wallet,
  });
  const inboxQuery = useQuery({
    queryKey: ["shop-inbox-badge", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      const ids = await fetchMyBusinessIds(profile!.id);
      const r = await fetchShopInbox(profile!.id, ids);
      return r.rows.filter((row) => row.unread).length;
    },
  });
  const wallet = walletQuery.data ?? { available_ngn: 0, pending_ngn: 0 };
  const inboxBadge = inboxQuery.data ?? enquiryCount;
  const walletBadge = wallet.pending_ngn > 0 ? 1 : 0;

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="font-bold">Marketplace dashboard</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Only counts stored for this business. Empty numbers mean nothing has been recorded yet.
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <DashTile to="/app/orders" icon={Package} label="Orders" count={recentOrderCount} />
        <DashTile to="/shop/enquiries" icon={Inbox} label="Inbox" count={inboxBadge} />
        <DashTile to="/app/business/payouts" icon={Wallet} label="Wallet" count={walletBadge} hint={wallet.pending_ngn > 0 ? "Pending" : undefined} />
      </div>
      <Button className="mt-3 min-h-11 w-full rounded-xl bg-[#0B1F4D] font-extrabold" asChild>
        <Link to="/app/assistant">Talk to TIJAR · sales and expenses by voice</Link>
      </Button>
    </section>
  );
}

function DashTile({
  to,
  icon: Icon,
  label,
  count,
  hint,
}: {
  to: "/app/orders" | "/shop/enquiries" | "/app/business/payouts";
  icon: typeof Package;
  label: string;
  count: number;
  hint?: string;
}) {
  return (
    <Link
      to={to}
      className="relative flex min-h-[5.5rem] flex-col items-center justify-center rounded-2xl border border-border bg-white px-2 py-3 text-center"
    >
      {count > 0 ? (
        <span className="absolute right-2 top-2 flex min-w-5 items-center justify-center rounded-full bg-[#1F7A4D] px-1 text-[10px] font-extrabold text-white">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
      <Icon className={cn("size-5", count > 0 ? "text-[#1F7A4D]" : "text-muted-foreground")} />
      <p className="mt-1 text-[13px] font-extrabold text-[#0B1F4D]">{label}</p>
      {hint ? <p className="text-[10px] font-semibold text-amber-700">{hint}</p> : null}
    </Link>
  );
}
