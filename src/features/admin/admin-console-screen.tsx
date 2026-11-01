"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import {
  BadgeCheck,
  Building2,
  ClipboardList,
  Crown,
  Download,
  Percent,
  Phone,
  Search,
  ShieldCheck,
  Store,
  Users,
  Wallet,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { downloadAdminCsv } from "@/features/admin/admin-export";
import {
  accountCategory,
  businessGross,
  businessLedgerSales,
  businessMarketplaceSales,
  categoryLabel,
  commissionOnAmount,
  totalsForFinance,
  userSpend,
  type AccountCategory,
} from "@/features/admin/admin-metrics";
import { useAuth } from "@/features/auth/auth-context";
import {
  DEFAULT_PLATFORM_COMMISSION_RATE,
  TIJAR_SUPER_ADMIN_EMAIL,
  isTijarSuperAdminEmail,
} from "@/lib/admin";
import { cn } from "@/lib/utils";
import {
  approveAllBusinesses,
  fetchAdminBusinesses,
  fetchAdminBusinessInsights,
  fetchAdminOrders,
  fetchAdminPayments,
  fetchAdminProfiles,
  fetchAdminTransactions,
  fetchAdminUpgradeRequests,
  reviewBusinessUpgrade,
  setBusinessPublished,
  setBusinessVerification,
  shopName,
  type AdminBusiness,
  type AdminOrder,
  type AdminTransaction,
  type KycStatus,
} from "@/services/admin-service";
import { fetchMyPlatformRoles, setListingModeration } from "@/services/discover-service";
import type { Profile } from "@/types/database";
import { formatNgn, formatNgnCompact } from "@/utils/money";

type Tab =
  | "overview"
  | "finance"
  | "kyc"
  | "applications"
  | "businesses"
  | "insights"
  | "users"
  | "transactions"
  | "orders";

const KYC_QUEUE: KycStatus[] = ["submitted", "under_review", "in_progress", "requires_update"];

const engagementConfig = {
  events: { label: "Activity", color: "hsl(160 45% 42%)" },
  sales: { label: "Sales", color: "hsl(210 55% 42%)" },
};

function dayKey(iso?: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatWhen(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-NG", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16);
  }
}

function lastDays(n: number): string[] {
  const days: string[] = [];
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function matchesQuery(haystack: string, q: string): boolean {
  if (!q) return true;
  return haystack.toLowerCase().includes(q.toLowerCase());
}

function StatusPill({
  label,
  tone = "muted",
}: {
  label: string;
  tone?: "ok" | "warn" | "bad" | "info" | "muted";
}) {
  const cls =
    tone === "ok"
      ? "bg-primary/10 text-primary"
      : tone === "warn"
        ? "bg-accent text-primary"
        : tone === "bad"
          ? "bg-destructive/10 text-destructive"
          : tone === "info"
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground";
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", cls)}>
      {label.replaceAll("_", " ")}
    </span>
  );
}

function kycTone(status: string): "ok" | "warn" | "bad" | "info" | "muted" {
  if (status === "verified") return "ok";
  if (status === "rejected") return "bad";
  if (status === "submitted" || status === "under_review") return "warn";
  if (status === "requires_update" || status === "in_progress") return "info";
  return "muted";
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
      <p className="font-bold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function recordedPhone(...candidates: Array<string | null | undefined>): string | null {
  for (const value of candidates) {
    const phone = value?.trim();
    if (phone) return phone;
  }
  return null;
}

function phoneKey(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

type LabeledPhone = { label: string; phone: string };

function collectUserPhones(
  user: Profile,
  shops: AdminBusiness[],
  applications: Array<{ profile_id: string; phone: string | null; whatsapp?: string | null }>,
  userOrders: AdminOrder[],
): LabeledPhone[] {
  const seen = new Set<string>();
  const out: LabeledPhone[] = [];
  function add(label: string, raw?: string | null) {
    const phone = raw?.trim();
    if (!phone) return;
    const key = phoneKey(phone);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ label, phone });
  }
  add("Account", user.phone);
  for (const shop of shops) {
    add(shop.business_name || "Shop", shop.public_phone);
    add("WhatsApp", shop.public_whatsapp);
  }
  for (const app of applications) {
    add("Application", app.phone);
    add("WhatsApp", app.whatsapp);
  }
  for (const order of userOrders) {
    add("Checkout", order.buyer_phone);
    add("Checkout", order.buyer?.phone);
  }
  return out;
}

function PhoneLink({ phone }: { phone?: string | null }) {
  const value = recordedPhone(phone);
  if (!value) return <span className="text-muted-foreground">No phone</span>;
  return (
    <a href={`tel:${value.replace(/\s+/g, "")}`} className="inline-flex items-center gap-1 font-semibold tabular-nums text-primary">
      <Phone className="size-3.5" />
      {value}
    </a>
  );
}

function PhoneNumbers({ phones }: { phones: LabeledPhone[] }) {
  if (phones.length === 0) return <span className="text-muted-foreground">No phone</span>;
  return (
    <ul className="space-y-1">
      {phones.map((item) => (
        <li key={`${item.label}-${item.phone}`}>
          <PhoneLink phone={item.phone} />
          <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

export function AdminConsoleScreen() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [query, setQuery] = useState("");
  const [userKind, setUserKind] = useState<"all" | AccountCategory>("all");
  const [ratePct, setRatePct] = useState(DEFAULT_PLATFORM_COMMISSION_RATE * 100);
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [approvingAll, setApprovingAll] = useState(false);
  const commissionRate = Math.max(0, ratePct) / 100;

  const rolesQuery = useQuery({
    queryKey: ["platform-roles", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => fetchMyPlatformRoles(profile!.id),
  });

  const isAdmin =
    isTijarSuperAdminEmail(profile?.email) || (rolesQuery.data ?? []).includes("admin");

  const businessesQuery = useQuery({
    queryKey: ["admin-businesses"],
    enabled: isAdmin,
    queryFn: async () => {
      const r = await fetchAdminBusinesses();
      if (r.error) throw new Error(r.error);
      return r.businesses;
    },
  });

  const upgradesQuery = useQuery({
    queryKey: ["admin-upgrades"],
    enabled: isAdmin,
    queryFn: async () => {
      const r = await fetchAdminUpgradeRequests();
      if (r.error) throw new Error(r.error);
      return r.requests;
    },
  });

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    enabled: isAdmin,
    queryFn: async () => {
      const r = await fetchAdminProfiles();
      if (r.error) throw new Error(r.error);
      return r.profiles;
    },
  });

  const ordersQuery = useQuery({
    queryKey: ["admin-orders"],
    enabled: isAdmin,
    queryFn: async () => {
      const r = await fetchAdminOrders();
      if (r.error) throw new Error(r.error);
      return r.orders;
    },
  });

  const txQuery = useQuery({
    queryKey: ["admin-transactions"],
    enabled: isAdmin,
    queryFn: async () => {
      const r = await fetchAdminTransactions();
      if (r.error) throw new Error(r.error);
      return r.transactions;
    },
  });

  const paymentsQuery = useQuery({
    queryKey: ["admin-payments"],
    enabled: isAdmin,
    queryFn: async () => {
      const r = await fetchAdminPayments();
      if (r.error) throw new Error(r.error);
      return r.payments;
    },
  });

  const insightsQuery = useQuery({
    queryKey: ["admin-business-insights"],
    enabled: isAdmin,
    queryFn: async () => {
      const r = await fetchAdminBusinessInsights();
      if (r.error) throw new Error(r.error);
      return r.insights;
    },
  });

  const businesses = businessesQuery.data ?? [];
  const users = usersQuery.data ?? [];
  const orders = ordersQuery.data ?? [];
  const transactions = txQuery.data ?? [];
  const payments = paymentsQuery.data ?? [];
  const upgrades = upgradesQuery.data ?? [];
  const insights = insightsQuery.data ?? [];

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const sales = transactions.filter((t) => t.type === "sale");
    const salesToday = sales.filter((t) => dayKey(t.occurred_at) === today);
    const ordersToday = orders.filter((o) => dayKey(o.created_at) === today);
    const newUsersToday = users.filter((u) => dayKey(u.created_at) === today);
    return {
      users: users.length,
      businesses: businesses.length,
      verified: businesses.filter((b) => b.verification_status === "verified").length,
      pendingKyc: businesses.filter((b) => KYC_QUEUE.includes(b.verification_status as KycStatus)).length,
      pendingApps: upgrades.filter((r) => r.status === "pending").length,
      transactions: transactions.length,
      salesVolume: sales.reduce((n, t) => n + Number(t.amount), 0),
      salesToday: salesToday.reduce((n, t) => n + Number(t.amount), 0),
      orders: orders.length,
      ordersToday: ordersToday.length,
      gmv: orders.reduce((n, o) => n + Number(o.total), 0),
      payments: payments.reduce((n, p) => n + Number(p.amount), 0),
      newUsersToday: newUsersToday.length,
      activeShopsToday: new Set(
        [
          ...salesToday.map((t) => t.business_id),
          ...ordersToday.map((o) => o.business_id),
        ].filter(Boolean),
      ).size,
    };
  }, [businesses, users, orders, transactions, payments, upgrades]);

  const finance = useMemo(
    () => totalsForFinance(transactions, orders, commissionRate),
    [transactions, orders, commissionRate],
  );

  const userLedger = useMemo(() => {
    return users.map((user) => {
      const kind = accountCategory(user, businesses);
      const spend = userSpend(user.id, orders);
      const owned = businesses.filter((b) => b.owner_id === user.id);
      const making = owned.reduce(
        (n, b) => n + businessGross(b.id, transactions, orders),
        0,
      );
      const phones = collectUserPhones(
        user,
        owned,
        upgrades.filter((r) => r.profile_id === user.id),
        orders.filter((o) => o.buyer_profile_id === user.id),
      );
      return { user, kind, spend, making, phones, commission: commissionOnAmount(spend + making, commissionRate) };
    });
  }, [users, businesses, orders, transactions, commissionRate, upgrades]);

  const businessLedger = useMemo(() => {
    return businesses.map((biz) => {
      const ledger = businessLedgerSales(biz.id, transactions);
      const market = businessMarketplaceSales(biz.id, orders);
      const gross = ledger + market;
      const commission = commissionOnAmount(gross, commissionRate);
      return { biz, ledger, market, gross, commission, net: gross - commission };
    });
  }, [businesses, transactions, orders, commissionRate]);

  const engagement = useMemo(() => {
    const days = lastDays(14);
    return days.map((day) => {
      const label = day.slice(8, 10);
      const tx = transactions.filter((t) => dayKey(t.occurred_at) === day);
      const dayOrders = orders.filter((o) => dayKey(o.created_at) === day);
      const dayUsers = users.filter((u) => dayKey(u.created_at) === day);
      const dayShops = businesses.filter((b) => dayKey(b.created_at) === day);
      const sales = tx.filter((t) => t.type === "sale").reduce((n, t) => n + Number(t.amount), 0);
      return {
        day,
        label,
        events: tx.length + dayOrders.length + dayUsers.length + dayShops.length,
        sales,
        transactions: tx.length,
        orders: dayOrders.length,
        users: dayUsers.length,
        shops: dayShops.length,
      };
    });
  }, [transactions, orders, users, businesses]);

  async function refreshAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-businesses"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-business-insights"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-upgrades"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-transactions"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-payments"] }),
      queryClient.invalidateQueries({ queryKey: ["moderation-listings"] }),
    ]);
  }

  function noteFor(id: string): string {
    return notesById[id] ?? "";
  }

  async function approveEverything() {
    if (approvingAll) return;
    if (!window.confirm("Approve every pending application and live every shop that is not suspended?")) return;
    setApprovingAll(true);
    const r = await approveAllBusinesses();
    setApprovingAll(false);
    if (r.error) toast.error(r.error);
    else {
      toast.success(`Approved ${r.applications} applications and ${r.shops} shops.`);
      void refreshAll();
    }
  }

  if (rolesQuery.isLoading && !isTijarSuperAdminEmail(profile?.email)) {
    return <p className="mt-8 text-muted-foreground">Checking admin access…</p>;
  }

  if (!isAdmin) {
    return (
      <div className="mt-8 rounded-2xl border border-dashed border-border p-6 text-center">
        <ShieldCheck className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-2 font-bold">Admins only</p>
        <p className="text-sm text-muted-foreground">Sign in as {TIJAR_SUPER_ADMIN_EMAIL}.</p>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "finance", label: "Finance" },
    { id: "kyc", label: "KYC" },
    { id: "applications", label: "Applications" },
    { id: "businesses", label: "Businesses" },
    { id: "insights", label: "Inventory & sales" },
    { id: "users", label: "Users" },
    { id: "transactions", label: "Transactions" },
    { id: "orders", label: "Orders" },
  ];

  function exportUsers() {
    downloadAdminCsv(
      `tijar-users-${stamp()}.csv`,
      ["Name", "Email", "Phone numbers", "Category", "Account mode", "Onboarding", "Spend", "Business making", "Commission", "Joined"],
      userLedger.map(({ user, kind, spend, making, commission, phones }) => [
        user.full_name,
        user.email,
        phones.map((p) => `${p.phone} (${p.label})`).join(" | "),
        categoryLabel(kind),
        user.account_mode ?? "business",
        user.onboarding_status,
        spend.toFixed(2),
        making.toFixed(2),
        commission.toFixed(2),
        user.created_at,
      ]),
    );
    toast.success("Users CSV downloaded");
  }

  function exportBusinesses() {
    downloadAdminCsv(
      `tijar-businesses-${stamp()}.csv`,
      ["Business", "Owner", "Owner phone", "Shop phone", "WhatsApp", "KYC", "Listing", "Published", "Ledger sales", "Marketplace sales", "Gross", "Commission", "Net"],
      businessLedger.map(({ biz, ledger, market, gross, commission, net }) => [
        biz.business_name,
        biz.owner?.full_name ?? biz.owner_id,
        recordedPhone(biz.owner?.phone) ?? "",
        recordedPhone(biz.public_phone, biz.owner?.phone) ?? "",
        recordedPhone(biz.public_whatsapp, biz.public_phone) ?? "",
        biz.verification_status,
        biz.moderation_status,
        biz.is_published ? "yes" : "no",
        ledger.toFixed(2),
        market.toFixed(2),
        gross.toFixed(2),
        commission.toFixed(2),
        net.toFixed(2),
      ]),
    );
    toast.success("Businesses CSV downloaded");
  }

  function exportTransactions() {
    downloadAdminCsv(
      `tijar-transactions-${stamp()}.csv`,
      ["When", "Shop", "Type", "Amount", "Commission", "Method", "Note"],
      transactions.map((tx) => [
        tx.occurred_at,
        shopName(tx),
        tx.type,
        Number(tx.amount).toFixed(2),
        commissionOnAmount(Number(tx.amount), commissionRate).toFixed(2),
        tx.payment_method,
        tx.description,
      ]),
    );
    toast.success("Transactions CSV downloaded");
  }

  function exportOrders() {
    downloadAdminCsv(
      `tijar-orders-${stamp()}.csv`,
      ["Order", "Buyer", "Email", "Shop", "Status", "Pay", "Total", "Commission", "When"],
      orders.map((order) => [
        order.order_number,
        order.buyer?.full_name,
        recordedPhone(order.buyer?.phone, order.buyer_phone) ?? order.buyer?.email,
        shopName(order),
        order.status,
        order.sale_transaction_id ? "confirmed_sale" : order.buyer_marked_paid_at ? "buyer_paid_now" : order.payment_method,
        Number(order.total).toFixed(2),
        commissionOnAmount(Number(order.total), commissionRate).toFixed(2),
        order.created_at,
      ]),
    );
    toast.success("Orders CSV downloaded");
  }

  function exportFinance() {
    downloadAdminCsv(
      `tijar-finance-${stamp()}.csv`,
      ["Metric", "Amount"],
      [
        ["Commission rate %", ratePct],
        ["User spend (marketplace)", finance.userSpendTotal.toFixed(2)],
        ["Ledger sales", finance.ledgerSales.toFixed(2)],
        ["Marketplace GMV", finance.marketplaceGmv.toFixed(2)],
        ["Business gross", finance.businessGross.toFixed(2)],
        ["Ledger commission", finance.ledgerCommission.toFixed(2)],
        ["Marketplace commission", finance.marketplaceCommission.toFixed(2)],
        ["Total commission", finance.totalCommission.toFixed(2)],
        ["Business net after commission", finance.businessNet.toFixed(2)],
      ],
    );
    toast.success("Finance summary downloaded");
  }

  const q = query.trim();
  const kycRows = businesses.filter((b) =>
    matchesQuery(
      [b.business_name, b.public_phone, b.public_whatsapp, b.owner?.phone, b.owner?.full_name, b.location, b.verification_status, b.moderation_status].join(" "),
      q,
    ),
  );
  const kycQueue = kycRows.filter((b) => KYC_QUEUE.includes(b.verification_status as KycStatus));
  const userRows = userLedger.filter(({ user, kind, phones }) => {
    if (userKind !== "all" && kind !== userKind) return false;
    return matchesQuery(
      [user.full_name, user.email, user.phone, user.account_mode, kind, ...phones.map((p) => `${p.phone} ${p.label}`)].join(" "),
      q,
    );
  });
  const bizFinanceRows = businessLedger.filter(({ biz }) =>
    matchesQuery([biz.business_name, biz.public_phone, biz.public_whatsapp, biz.owner?.phone, biz.owner?.full_name, biz.location, biz.public_slug].join(" "), q),
  );
  const txRows = transactions.filter((t) =>
    matchesQuery([shopName(t), t.type, t.description, t.payment_method].join(" "), q),
  );
  const orderRows = orders.filter((o) =>
    matchesQuery(
      [o.order_number, shopName(o), o.status, o.buyer?.full_name, o.buyer?.email, o.buyer?.phone, o.buyer_phone, o.businesses?.public_phone].join(" "),
      q,
    ),
  );

  return (
    <div className="pb-8">
      <section className="overflow-hidden rounded-[1.35rem] border border-primary/15 bg-[linear-gradient(135deg,oklch(0.27_0.05_210),oklch(0.36_0.07_175))] p-5 text-white shadow-lg lg:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">TIJAR operations</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight lg:text-3xl">Admin console</h1>
            <p className="mt-1 text-sm text-white/85">{profile?.email ?? TIJAR_SUPER_ADMIN_EMAIL}</p>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <span className="self-end rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wide">
              Super admin
            </span>
            <Button
              className="rounded-full bg-white font-extrabold text-primary hover:bg-white/90"
              disabled={approvingAll}
              onClick={() => void approveEverything()}
            >
              <BadgeCheck className="mr-1.5 size-4" />
              {approvingAll ? "Approving…" : "Approve all businesses"}
            </Button>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <Kpi icon={Users} label="Users" value={String(stats.users)} hint={`${stats.newUsersToday} today`} />
          <Kpi icon={Store} label="Businesses" value={String(stats.businesses)} hint={`${stats.verified} KYC verified`} />
          <Kpi icon={BadgeCheck} label="KYC queue" value={String(stats.pendingKyc)} hint={`${stats.pendingApps} applications`} />
          <Kpi icon={Wallet} label="Sales (ledger)" value={formatNgnCompact(stats.salesVolume)} hint={`${formatNgnCompact(stats.salesToday)} today`} />
          <Kpi icon={Building2} label="Marketplace GMV" value={formatNgnCompact(stats.gmv)} hint={`${stats.ordersToday} orders today`} />
          <Kpi icon={Percent} label="Commission" value={formatNgnCompact(finance.totalCommission)} hint={`${ratePct}% of volume`} />
        </div>
      </section>

      <div className="mt-4 flex gap-1 overflow-x-auto pb-1">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setTab(item.id);
              setQuery("");
            }}
            className={cn(
              "whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-bold",
              tab === item.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {item.label}
            {item.id === "kyc" && stats.pendingKyc > 0 ? ` (${stats.pendingKyc})` : ""}
            {item.id === "applications" && stats.pendingApps > 0 ? ` (${stats.pendingApps})` : ""}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="rounded-xl font-bold" onClick={exportUsers}>
          <Download className="mr-1.5 size-3.5" /> Users
        </Button>
        <Button size="sm" variant="outline" className="rounded-xl font-bold" onClick={exportBusinesses}>
          <Download className="mr-1.5 size-3.5" /> Businesses
        </Button>
        <Button size="sm" variant="outline" className="rounded-xl font-bold" onClick={exportTransactions}>
          <Download className="mr-1.5 size-3.5" /> Transactions
        </Button>
        <Button size="sm" variant="outline" className="rounded-xl font-bold" onClick={exportOrders}>
          <Download className="mr-1.5 size-3.5" /> Orders
        </Button>
        <Button size="sm" variant="outline" className="rounded-xl font-bold" onClick={exportFinance}>
          <Download className="mr-1.5 size-3.5" /> Finance
        </Button>
      </div>

      {tab !== "overview" && tab !== "finance" && (
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${tab}…`}
            className="h-11 rounded-2xl pl-9"
          />
        </div>
      )}

      {tab === "overview" && (
        <div className="mt-4 grid gap-4 lg:grid-cols-5">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm lg:col-span-3">
            <div className="flex items-center justify-between">
              <h2 className="font-extrabold">Daily engagement</h2>
              <span className="text-[10px] font-semibold uppercase text-muted-foreground">Last 14 days</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Users joining, shops opening, ledger entries, and marketplace orders.
            </p>
            <ChartContainer config={engagementConfig} className="mt-3 h-[220px] w-full aspect-auto">
              <BarChart data={engagement} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="4 4" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={36} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="events" fill="var(--color-events)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm lg:col-span-2">
            <h2 className="font-extrabold">Sales volume</h2>
            <p className="mt-1 text-xs text-muted-foreground">Recorded business sales across the platform.</p>
            <ChartContainer config={engagementConfig} className="mt-3 h-[220px] w-full aspect-auto">
              <AreaChart data={engagement} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="4 4" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v) => formatNgnCompact(Number(v))} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area type="monotone" dataKey="sales" stroke="var(--color-sales)" fill="var(--color-sales)" fillOpacity={0.18} />
              </AreaChart>
            </ChartContainer>
          </div>
          <Link to="/app/admin/moderation" className="rounded-2xl border border-border bg-card p-4 shadow-sm lg:col-span-1">
            <ClipboardList className="size-5 text-primary" />
            <p className="mt-2 font-extrabold">Listing moderation</p>
            <p className="mt-1 text-sm text-muted-foreground">Flag or suspend public shops.</p>
          </Link>
          <Link to="/app/admin/translate" className="rounded-2xl border border-border bg-card p-4 shadow-sm lg:col-span-1">
            <ShieldCheck className="size-5 text-primary" />
            <p className="mt-2 font-extrabold">Translations</p>
            <p className="mt-1 text-sm text-muted-foreground">System copy and language coverage.</p>
          </Link>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm lg:col-span-3">
            <h2 className="font-extrabold">Needs attention</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex justify-between gap-3">
                <span>KYC waiting review</span>
                <button type="button" className="font-bold text-primary" onClick={() => setTab("kyc")}>
                  {stats.pendingKyc}
                </button>
              </li>
              <li className="flex justify-between gap-3">
                <span>Business applications</span>
                <button type="button" className="font-bold text-primary" onClick={() => setTab("applications")}>
                  {stats.pendingApps}
                </button>
              </li>
              <li className="flex justify-between gap-3">
                <span>Marketplace orders</span>
                <button type="button" className="font-bold text-primary" onClick={() => setTab("orders")}>
                  {stats.orders}
                </button>
              </li>
              <li className="flex justify-between gap-3">
                <span>Platform commission</span>
                <button type="button" className="font-bold text-primary" onClick={() => setTab("finance")}>
                  {formatNgn(finance.totalCommission)}
                </button>
              </li>
            </ul>
          </div>
        </div>
      )}

      {tab === "finance" && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
            <label className="text-sm font-semibold">
              Commission rate
              <Input
                type="number"
                min={0}
                max={40}
                step={0.1}
                value={ratePct}
                onChange={(e) => setRatePct(Number(e.target.value) || 0)}
                className="mt-1 h-10 w-28 rounded-xl"
              />
            </label>
            <p className="pb-2 text-xs text-muted-foreground">
              Applied to marketplace GMV and recorded business sales.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <FinanceStat label="User spend" value={formatNgn(finance.userSpendTotal)} hint="Marketplace checkouts" />
            <FinanceStat label="Business making" value={formatNgn(finance.businessGross)} hint="Ledger + marketplace" />
            <FinanceStat label="TIJAR commission" value={formatNgn(finance.totalCommission)} hint={`${ratePct}% take`} />
            <FinanceStat label="Business net" value={formatNgn(finance.businessNet)} hint="After commission" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-4">
              <h2 className="font-extrabold">Top customer spend</h2>
              <ul className="mt-3 space-y-2">
                {[...userLedger]
                  .sort((a, b) => b.spend - a.spend)
                  .slice(0, 8)
                  .map(({ user, spend, kind }) => (
                    <li key={user.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">
                        <span className="font-semibold">{user.full_name || user.email}</span>
                        <span className="ml-2 text-[11px] text-muted-foreground">{categoryLabel(kind)}</span>
                      </span>
                      <span className="font-extrabold tabular-nums">{formatNgn(spend)}</span>
                    </li>
                  ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <h2 className="font-extrabold">Top business making</h2>
              <ul className="mt-3 space-y-2">
                {[...businessLedger]
                  .sort((a, b) => b.gross - a.gross)
                  .slice(0, 8)
                  .map(({ biz, gross, commission }) => (
                    <li key={biz.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate font-semibold">{biz.business_name}</span>
                      <span className="text-right">
                        <span className="block font-extrabold tabular-nums">{formatNgn(gross)}</span>
                        <span className="text-[11px] text-muted-foreground">fee {formatNgn(commission)}</span>
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {tab === "kyc" && (
        <section className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Approve shops one by one, or clear the whole queue.
            </p>
            <Button
              className="rounded-xl font-bold"
              disabled={approvingAll || stats.pendingKyc + stats.pendingApps === 0}
              onClick={() => void approveEverything()}
            >
              {approvingAll ? "Approving…" : `Approve all (${stats.pendingKyc + stats.pendingApps})`}
            </Button>
          </div>
          {kycQueue.length === 0 && q === "" && (
            <EmptyState title="No KYC waiting" body="Submitted and in-review businesses will appear here." />
          )}
          {(q ? kycRows : kycQueue.length ? kycQueue : kycRows).map((biz) => (
            <KycCard
              key={biz.id}
              biz={biz}
              notes={noteFor(biz.id)}
              onNotes={(value) => setNotesById((prev) => ({ ...prev, [biz.id]: value }))}
              onAction={async (status) => {
                const { error } = await setBusinessVerification(biz.id, status, noteFor(biz.id));
                if (error) toast.error(error);
                else {
                  toast.success(status === "verified" ? "KYC approved" : `KYC set to ${status.replaceAll("_", " ")}`);
                  void refreshAll();
                }
              }}
            />
          ))}
        </section>
      )}

      {tab === "applications" && (
        <ul className="mt-4 space-y-3">
          <li className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
            <p className="text-sm font-semibold">Pending applications: {stats.pendingApps}</p>
            <Button
              className="rounded-xl font-bold"
              disabled={approvingAll || stats.pendingApps === 0}
              onClick={() => void approveEverything()}
            >
              {approvingAll ? "Approving…" : "Approve all applications"}
            </Button>
          </li>
          {upgrades.filter((r) => matchesQuery([r.business_name, r.phone, r.city, r.status].join(" "), q)).length === 0 && (
            <EmptyState title="No applications" body="Customer requests to open a business account land here." />
          )}
          {upgrades
            .filter((r) => matchesQuery([r.business_name, r.phone, r.city, r.status].join(" "), q))
            .map((req) => (
              <li key={req.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-extrabold">{req.business_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[req.street, req.city, req.state].filter(Boolean).join(", ") || "No address"}
                    </p>
                    <p className="mt-1 text-sm">
                      <PhoneLink phone={req.phone} />
                      {req.whatsapp && req.whatsapp !== req.phone ? (
                        <span className="ml-2 text-xs text-muted-foreground">WhatsApp {req.whatsapp}</span>
                      ) : null}
                    </p>
                    {req.description ? <p className="mt-2 text-sm">{req.description}</p> : null}
                  </div>
                  <StatusPill
                    label={req.status}
                    tone={req.status === "approved" ? "ok" : req.status === "rejected" ? "bad" : "warn"}
                  />
                </div>
                {req.status === "pending" && (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={noteFor(req.id)}
                      onChange={(e) => setNotesById((prev) => ({ ...prev, [req.id]: e.target.value }))}
                      placeholder="Review notes"
                      className="h-10 rounded-xl"
                    />
                    <Button
                      className="rounded-xl font-bold"
                      onClick={async () => {
                        const { error } = await reviewBusinessUpgrade(req.id, true, noteFor(req.id));
                        if (error) toast.error(error);
                        else {
                          toast.success("Business account approved");
                          void refreshAll();
                        }
                      }}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-xl font-bold"
                      onClick={async () => {
                        const { error } = await reviewBusinessUpgrade(req.id, false, noteFor(req.id));
                        if (error) toast.error(error);
                        else {
                          toast.message("Application rejected");
                          void refreshAll();
                        }
                      }}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </li>
            ))}
        </ul>
      )}

      {tab === "businesses" && (
        <AdminTable
          empty="No businesses yet."
          headers={["Business", "Shop phone", "Owner phone", "Making", "KYC", "Listing", "Actions"]}
        >
          {bizFinanceRows.map(({ biz, gross }) => (
            <tr key={biz.id} className="border-t border-border align-top">
              <td className="px-3 py-3">
                <p className="font-semibold">{biz.business_name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {biz.owner?.full_name ?? "Owner"} · {biz.public_location_label ?? biz.location ?? "—"}
                </p>
              </td>
              <td className="px-3 py-3">
                <PhoneLink phone={recordedPhone(biz.public_phone, biz.public_whatsapp, biz.owner?.phone)} />
              </td>
              <td className="px-3 py-3">
                <PhoneLink phone={recordedPhone(biz.owner?.phone, biz.public_phone)} />
              </td>
              <td className="px-3 py-3 font-extrabold tabular-nums">{formatNgn(gross)}</td>
              <td className="px-3 py-3">
                <StatusPill label={biz.verification_status} tone={kycTone(biz.verification_status)} />
              </td>
              <td className="px-3 py-3">
                <StatusPill
                  label={biz.moderation_status}
                  tone={biz.moderation_status === "approved" ? "ok" : biz.moderation_status === "suspended" ? "bad" : "warn"}
                />
              </td>
              <td className="px-3 py-3">
                <div className="flex flex-wrap gap-1.5">
                  {biz.verification_status !== "verified" ? (
                    <Button
                      size="sm"
                      className="h-8 rounded-lg text-xs"
                      onClick={async () => {
                        const { error } = await setBusinessVerification(biz.id, "verified");
                        if (error) toast.error(error);
                        else {
                          toast.success("Shop approved");
                          void refreshAll();
                        }
                      }}
                    >
                      Approve
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-lg text-xs"
                    onClick={async () => {
                      const { error } = await setBusinessPublished(biz.id, !biz.is_published);
                      if (error) toast.error(error);
                      else {
                        toast.success(biz.is_published ? "Unpublished" : "Published");
                        void refreshAll();
                      }
                    }}
                  >
                    {biz.is_published ? "Unpublish" : "Publish"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-lg text-xs"
                    onClick={async () => {
                      const next = biz.moderation_status === "approved" ? "suspended" : "approved";
                      const { error } = await setListingModeration(biz.id, next);
                      if (error) toast.error(error);
                      else {
                        toast.success(next === "approved" ? "Listing live" : "Listing suspended");
                        void refreshAll();
                      }
                    }}
                  >
                    {biz.moderation_status === "approved" ? "Suspend" : "Approve listing"}
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </AdminTable>
      )}

      {tab === "users" && (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(["all", "customer", "business", "both"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setUserKind(kind)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-bold",
                  userKind === kind ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {kind === "all" ? "All" : categoryLabel(kind)}
              </button>
            ))}
          </div>
          <AdminTable empty="No users in this category." headers={["Name", "Phone numbers", "Category", "Spend", "Business making", "Email", "Joined"]}>
            {userRows.map((row) => (
              <UserRow key={row.user.id} row={row} />
            ))}
          </AdminTable>
        </>
      )}

      {tab === "insights" && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              {
                label: "Total inventory",
                value: `${insights.reduce((s, i) => s + i.inventory_units, 0).toLocaleString()} units`,
                hint: `${insights.reduce((s, i) => s + i.product_count, 0).toLocaleString()} products`,
              },
              {
                label: "Total sales",
                value: formatNgnCompact(insights.reduce((s, i) => s + i.sales_total, 0)),
                hint: `${insights.reduce((s, i) => s + i.orders_count, 0).toLocaleString()} orders`,
              },
              {
                label: "Credit reminder",
                value: formatNgnCompact(insights.reduce((s, i) => s + i.credit_pending, 0)),
                hint: "Unpaid (pay-on-delivery) orders",
              },
              {
                label: "Social shares",
                value: insights.reduce((s, i) => s + i.share_count, 0).toLocaleString(),
                hint: "Shares that promote shops",
              },
            ].map((tile) => (
              <div key={tile.label} className="rounded-xl border border-border bg-card px-3 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{tile.label}</p>
                <p className="mt-1 text-lg font-extrabold tabular-nums">{tile.value}</p>
                <p className="text-[10px] font-medium text-muted-foreground">{tile.hint}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <Crown className="size-4 text-amber-500" />
              <h3 className="text-sm font-extrabold">Business of the week</h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Ranked by how often their shop links and posts were shared to other social apps. Promote the top shops.
            </p>
            {insights.filter((i) => i.share_count > 0).length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">No shares recorded yet.</p>
            ) : (
              <ol className="mt-3 space-y-2">
                {insights
                  .filter((i) => i.share_count > 0)
                  .slice(0, 5)
                  .map((i, index) => (
                    <li key={i.business_id} className="flex items-center gap-3">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-extrabold text-primary-foreground">
                        {index + 1}
                      </span>
                      <span className="size-8 shrink-0 overflow-hidden rounded-lg bg-muted">
                        {i.logo_url ? (
                          <img src={i.logo_url} alt="" className="size-full object-cover" />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-bold">{i.business_name}</span>
                      <span className="text-xs font-semibold text-muted-foreground">
                        {i.share_count.toLocaleString()} shares
                      </span>
                    </li>
                  ))}
              </ol>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {insightsQuery.isLoading
              ? "Loading business metrics…"
              : `Inventory, sales and credit per business · ${insights.length} shops`}
          </p>
          <AdminTable
            empty="No business metrics yet."
            headers={["Shop", "Contact", "Inventory", "Products", "Orders", "Sales", "Credit owed", "Shares", "Likes"]}
          >
            {insights.map((i) => (
              <tr key={i.business_id} className="border-t border-border/60">
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="size-7 shrink-0 overflow-hidden rounded-md bg-muted">
                      {i.logo_url ? <img src={i.logo_url} alt="" className="size-full object-cover" /> : null}
                    </span>
                    <span className="font-bold">{i.business_name}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{i.contact_phone ?? "—"}</td>
                <td className="px-3 py-2.5 tabular-nums">{i.inventory_units.toLocaleString()}</td>
                <td className="px-3 py-2.5 tabular-nums">{i.product_count.toLocaleString()}</td>
                <td className="px-3 py-2.5 tabular-nums">{i.orders_count.toLocaleString()}</td>
                <td className="px-3 py-2.5 font-semibold tabular-nums">{formatNgn(i.sales_total)}</td>
                <td
                  className={cn(
                    "px-3 py-2.5 tabular-nums",
                    i.credit_pending > 0 && "font-semibold text-amber-600",
                  )}
                >
                  {i.credit_pending > 0 ? formatNgn(i.credit_pending) : "—"}
                </td>
                <td className="px-3 py-2.5 tabular-nums">{i.share_count.toLocaleString()}</td>
                <td className="px-3 py-2.5 tabular-nums">{i.like_count.toLocaleString()}</td>
              </tr>
            ))}
          </AdminTable>
        </div>
      )}

      {tab === "transactions" && (
        <AdminTable empty="No ledger transactions yet." headers={["When", "Shop", "Type", "Amount", "Commission", "Method", "Note"]}>
          {txRows.map((tx) => (
            <TxRow key={tx.id} tx={tx} rate={commissionRate} />
          ))}
        </AdminTable>
      )}

      {tab === "orders" && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Marketplace checkout · {payments.length} payment records · {formatNgn(stats.payments)} captured/initiated ·
            commission {formatNgn(finance.marketplaceCommission)}
          </p>
          <AdminTable empty="No marketplace orders yet." headers={["Order", "Buyer", "Shop", "Status", "Pay", "Total", "Commission", "When"]}>
            {orderRows.map((order) => (
              <OrderRow key={order.id} order={order} rate={commissionRate} />
            ))}
          </AdminTable>
        </div>
      )}
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl bg-white/12 px-3 py-3 backdrop-blur-sm">
      <div className="flex items-center gap-1.5 text-white/80">
        <Icon className="size-3.5" />
        <p className="text-[10px] font-semibold uppercase tracking-wide">{label}</p>
      </div>
      <p className="mt-1 text-lg font-extrabold tabular-nums">{value}</p>
      <p className="text-[10px] font-medium text-white/70">{hint}</p>
    </div>
  );
}

function AdminTable({
  headers,
  empty,
  children,
}: {
  headers: string[];
  empty: string;
  children: ReactNode;
}) {
  const rows = Array.isArray(children) ? children : [children];
  if (rows.filter(Boolean).length === 0) {
    return (
      <div className="mt-4">
        <EmptyState title={empty} body="New activity will show here automatically." />
      </div>
    );
  }
  return (
    <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-muted/60 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-3 py-2.5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function UserRow({
  row,
}: {
  row: {
    user: Profile;
    kind: AccountCategory;
    spend: number;
    making: number;
    phones: LabeledPhone[];
  };
}) {
  const { user, kind, spend, making, phones } = row;
  return (
    <tr className="border-t border-border align-top">
      <td className="px-3 py-2.5">
        <p className="font-semibold">{user.full_name || "—"}</p>
      </td>
      <td className="min-w-[11rem] px-3 py-2.5">
        <PhoneNumbers phones={phones} />
      </td>
      <td className="px-3 py-2.5">
        <StatusPill
          label={categoryLabel(kind)}
          tone={kind === "business" ? "info" : kind === "both" ? "ok" : "muted"}
        />
      </td>
      <td className="px-3 py-2.5 font-extrabold tabular-nums">{formatNgn(spend)}</td>
      <td className="px-3 py-2.5 tabular-nums">{formatNgn(making)}</td>
      <td className="px-3 py-2.5 text-muted-foreground">{user.email ?? "—"}</td>
      <td className="px-3 py-2.5 text-muted-foreground">{formatWhen(user.created_at)}</td>
    </tr>
  );
}

function TxRow({ tx, rate }: { tx: AdminTransaction; rate: number }) {
  const amount = Number(tx.amount);
  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2.5 text-muted-foreground">{formatWhen(tx.occurred_at)}</td>
      <td className="px-3 py-2.5 font-semibold">{shopName(tx)}</td>
      <td className="px-3 py-2.5 capitalize">{tx.type.replaceAll("_", " ")}</td>
      <td className="px-3 py-2.5 font-extrabold tabular-nums">{formatNgn(amount)}</td>
      <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{formatNgn(commissionOnAmount(amount, rate))}</td>
      <td className="px-3 py-2.5 text-muted-foreground">{tx.payment_method ?? "—"}</td>
      <td className="max-w-[220px] truncate px-3 py-2.5 text-muted-foreground">{tx.description ?? "—"}</td>
    </tr>
  );
}

function OrderRow({ order, rate }: { order: AdminOrder; rate: number }) {
  const total = Number(order.total);
  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2.5 font-semibold">{order.order_number}</td>
      <td className="px-3 py-2.5">
        <p>{order.buyer?.full_name ?? "Buyer"}</p>
        <p className="text-[11px] text-muted-foreground">{order.buyer?.email ?? "—"}</p>
        <p className="text-[11px]"><PhoneLink phone={recordedPhone(order.buyer?.phone, order.buyer_phone)} /></p>
      </td>
      <td className="px-3 py-2.5">{shopName(order)}</td>
      <td className="px-3 py-2.5">
        <StatusPill label={order.status} tone={order.status.includes("cancel") ? "bad" : order.sale_transaction_id ? "ok" : "info"} />
      </td>
      <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
        {order.sale_transaction_id
          ? "Confirmed sale"
          : order.buyer_marked_paid_at
            ? "Buyer paid now"
            : order.payment_method === "transfer"
              ? "Transfer"
              : (order.payment_method ?? "—")}
      </td>
      <td className="px-3 py-2.5 font-extrabold tabular-nums">{formatNgn(total)}</td>
      <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{formatNgn(commissionOnAmount(total, rate))}</td>
      <td className="px-3 py-2.5 text-muted-foreground">{formatWhen(order.created_at)}</td>
    </tr>
  );
}

function FinanceStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-extrabold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function KycCard({
  biz,
  notes,
  onNotes,
  onAction,
}: {
  biz: AdminBusiness;
  notes: string;
  onNotes: (value: string) => void;
  onAction: (status: KycStatus) => Promise<void>;
}) {
  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-extrabold">{biz.business_name}</p>
          <p className="text-xs text-muted-foreground">
            {biz.owner?.full_name ?? "Owner"} · {biz.public_location_label ?? biz.location ?? "No location"}
          </p>
          <p className="mt-1 text-sm">
            Shop <PhoneLink phone={recordedPhone(biz.public_phone, biz.public_whatsapp, biz.owner?.phone)} />
          </p>
          <p className="text-sm">
            Owner <PhoneLink phone={recordedPhone(biz.owner?.phone, biz.public_phone)} />
          </p>
          {biz.description ? <p className="mt-2 line-clamp-2 text-sm">{biz.description}</p> : null}
          {biz.moderation_notes ? (
            <p className="mt-2 text-xs text-muted-foreground">Notes: {biz.moderation_notes}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1">
          <StatusPill label={biz.verification_status} tone={kycTone(biz.verification_status)} />
          <StatusPill
            label={biz.moderation_status}
            tone={biz.moderation_status === "approved" ? "ok" : "muted"}
          />
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2 lg:flex-row">
        <Input
          value={notes}
          onChange={(e) => onNotes(e.target.value)}
          placeholder="KYC review notes"
          className="h-10 rounded-xl"
        />
        <div className="flex flex-wrap gap-2">
          <Button className="rounded-xl font-bold" onClick={() => void onAction("verified")}>
            Approve KYC
          </Button>
          <Button variant="outline" className="rounded-xl font-bold" onClick={() => void onAction("under_review")}>
            Under review
          </Button>
          <Button variant="outline" className="rounded-xl font-bold" onClick={() => void onAction("requires_update")}>
            Request update
          </Button>
          <Button variant="outline" className="rounded-xl font-bold" onClick={() => void onAction("rejected")}>
            Reject
          </Button>
        </div>
      </div>
    </article>
  );
}
