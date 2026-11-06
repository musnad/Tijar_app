"use client";

import { Link } from "@tanstack/react-router";
import { Clapperboard, Inbox, Package, ShieldCheck, Sparkles, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { METRIC_DEFINITIONS } from "@/lib/business/capabilities";
import type { ContentAnalytics } from "@/services/seller-dashboard-service";
import type { Business } from "@/types/database";

export function SellerCommerceCard({
  business,
  completeness,
  publishedProducts,
  videoCounts,
  analytics,
  analyticsReady,
  recentOrderCount,
  enquiryCount,
}: {
  business: Business;
  completeness: { score: number; missing: string[] };
  publishedProducts: number;
  videoCounts: ContentAnalytics["video_counts"];
  analytics: ContentAnalytics;
  analyticsReady: boolean;
  recentOrderCount: number;
  enquiryCount: number;
}) {
  const verified = business.verification_status === "verified";

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-bold">Marketplace dashboard</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Only counts stored for this business. Empty numbers mean nothing has been recorded yet.
          </p>
        </div>
        <Button size="sm" className="rounded-xl" asChild>
          <Link to="/app/videos/new">Publish</Link>
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Profile" value={`${completeness.score}%`} hint={completeness.missing[0] ? `Next: ${completeness.missing[0]}` : "Complete"} />
        <Stat
          label="Verification"
          value={verified ? "Verified" : business.verification_status.replace(/_/g, " ")}
          hint={verified ? "TIJAR checked this shop" : "Finish KYC from Business settings"}
        />
        <Stat label="Live listings" value={String(publishedProducts)} hint="Published catalogue items" />
        <Stat
          label="Videos"
          value={String(videoCounts.published)}
          hint={`${videoCounts.draft} draft · ${videoCounts.pending_moderation} in review`}
        />
      </div>

      <div className="mt-4 rounded-xl bg-muted/50 p-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Engagement (this shop only)</p>
        {!analyticsReady && (
          <p className="mt-1 text-xs text-primary">
            Analytics RPC is not applied yet (migration 000021). Totals below stay at zero instead of inventing numbers.
          </p>
        )}
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-4">
          <Metric k="Impressions" v={analytics.impressions} />
          <Metric k="Qualified views" v={analytics.qualified_views} />
          <Metric k="Likes" v={analytics.likes} />
          <Metric k="Saves" v={analytics.saves} />
          <Metric k="Shares" v={analytics.shares} />
          <Metric k="Product clicks" v={analytics.product_clicks} />
          <Metric k="Enquiries" v={analytics.enquiries} />
          <Metric k="Order requests" v={analytics.order_requests} />
          <Metric k="Confirmed orders" v={analytics.confirmed_orders} />
        </dl>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Views are not purchases. Attributed orders ({analytics.attributed_orders}) are confirmed orders that include a product tagged on your videos — not an ads claim.
        </p>
        <details className="mt-2 text-[11px] text-muted-foreground">
          <summary className="cursor-pointer font-semibold">How these numbers are counted</summary>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {Object.entries(METRIC_DEFINITIONS).map(([k, v]) => (
              <li key={k}>
                <span className="font-semibold">{k.replace(/_/g, " ")}:</span> {v}
              </li>
            ))}
          </ul>
        </details>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <DashLink to="/app/products" icon={Package} label="Products" />
        <DashLink to="/app/videos" icon={Clapperboard} label="Videos" />
        <DashLink to="/app/inbox" icon={Inbox} label={`Inbox (${enquiryCount})`} />
        <DashLink to="/app/orders" icon={ShieldCheck} label={`Orders (${recentOrderCount})`} />
        <DashLink to="/app/business/payouts" icon={Wallet} label="Wallet" />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" className="rounded-xl bg-[#1F7A4D] font-bold text-white hover:bg-[#1F7A4D]/90" asChild>
          <Link to="/app/studio">
            <Sparkles className="size-3.5" />
            AI Marketing Studio
          </Link>
        </Button>
        <Button variant="outline" size="sm" className="rounded-xl" asChild>
          <Link to="/app/team">Staff</Link>
        </Button>
        <Button variant="outline" size="sm" className="rounded-xl" asChild>
          <Link to="/app/business/publish">Storefront</Link>
        </Button>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Subscription billing is not connected. Usage shown here is marketplace activity, not a paid plan.
      </p>
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-extrabold capitalize">{value}</p>
      <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function Metric({ k, v }: { k: string; v: number }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-bold tabular-nums">{v}</dd>
    </div>
  );
}

function DashLink({
  to,
  icon: Icon,
  label,
}: {
  to: "/app/products" | "/app/videos" | "/app/inbox" | "/app/orders" | "/app/business/payouts";
  icon: typeof Package;
  label: string;
}) {
  return (
    <Link to={to} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-bold">
      <Icon className="size-4 text-primary" />
      {label}
    </Link>
  );
}
