"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppPageHeader } from "@/features/app-layout/app-page-header";
import { BankAccountForm } from "@/features/business/bank-account-form";
import { CreateReceivingAccountButton } from "@/features/business/create-receiving-account";
import { displayShopName } from "@/lib/shop-names";
import { fetchOwnedBusinesses } from "@/services/business-service";
import {
  fetchSellerWallet,
  fetchVirtualAccountWallet,
  requestSellerPayout,
} from "@/services/marketplace-service";
import { fetchSellerOrders } from "@/services/seller-dashboard-service";
import { fetchTodayTotals, listRecentTransactions } from "@/services/transaction-service";
import { formatNgn } from "@/utils/money";
import type { Business } from "@/types/database";

export function PayoutWalletScreen({
  business,
  profileId,
}: {
  business: Business;
  profileId?: string;
}) {
  const queryClient = useQueryClient();
  const shopsQuery = useQuery({
    queryKey: ["owned-businesses", profileId],
    enabled: Boolean(profileId),
    queryFn: async () => {
      const r = await fetchOwnedBusinesses(profileId!);
      if (r.error && r.businesses.length === 0) throw new Error(r.error);
      return r.businesses.length ? r.businesses : [business];
    },
  });
  const shops = shopsQuery.data?.length ? shopsQuery.data : [business];
  const [selectedId, setSelectedId] = useState(business.id);
  const selected = useMemo(
    () => shops.find((s) => s.id === selectedId) ?? shops[0] ?? business,
    [shops, selectedId, business],
  );

  const salesQuery = useQuery({
    queryKey: ["shop-payout-sales", selected.id],
    queryFn: async () => {
      const [today, txs, orders] = await Promise.all([
        fetchTodayTotals(selected.id),
        listRecentTransactions(selected.id, 30),
        fetchSellerOrders(selected.id),
      ]);
      return {
        todaySales: today.sales,
        transactions: txs.data.filter((t) => t.type === "sale"),
        orders: orders.orders,
        error: today.error || txs.error || orders.error,
      };
    },
  });

  const walletQuery = useQuery({
    queryKey: ["shop-wallet", selected.id],
    queryFn: async () => {
      const [va, ledger] = await Promise.all([
        fetchVirtualAccountWallet(selected.id),
        fetchSellerWallet(selected.id),
      ]);
      return {
        configured: va.configured,
        account: va.account,
        accounts: va.accounts,
        wallet: va.wallet.available_ngn || va.wallet.pending_ngn ? va.wallet : ledger.wallet,
        requests: ledger.requests,
        credits: va.credits.length ? va.credits : ledger.credits,
        error: va.error || ledger.error,
      };
    },
  });

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);

  const shopSales = salesQuery.data?.transactions ?? [];
  const todaySales = salesQuery.data?.todaySales ?? 0;
  const pendingConfirms = (salesQuery.data?.orders ?? []).filter(
    (o) => o.status === "pending_payment" && o.buyer_marked_paid_at,
  ).length;
  const shopName = displayShopName(selected.business_name);
  const account = walletQuery.data?.account;
  const accounts = walletQuery.data?.accounts?.length
    ? walletQuery.data.accounts
    : account
      ? [account]
      : [];
  const wallet = walletQuery.data?.wallet ?? { available_ngn: 0, pending_ngn: 0 };
  const requests = walletQuery.data?.requests ?? [];
  const credits = walletQuery.data?.credits ?? [];

  async function withdraw() {
    const amount = Number(withdrawAmount.replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount < 100) {
      toast.error("Enter at least ₦100.");
      return;
    }
    setWithdrawing(true);
    const result = await requestSellerPayout(selected.id, amount);
    setWithdrawing(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? "Withdrawal sent.");
    setWithdrawAmount("");
    await queryClient.invalidateQueries({ queryKey: ["shop-wallet", selected.id] });
  }

  return (
    <>
      <AppPageHeader
        title="Wallet & payouts"
        subtitle={`${shopName} — buyers pay a TIJAR account. You withdraw to your bank.`}
      />

      {shops.length > 1 ? (
        <label className="mt-4 block text-xs font-bold">
          Shop
          <select
            className="mt-1 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-semibold"
            value={selected.id}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {displayShopName(s.business_name)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <section className="mt-5 rounded-2xl border border-border bg-card p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">TIJAR wallet</p>
        <p className="mt-1 text-3xl font-extrabold text-[#0B1F4D]">{formatNgn(wallet.available_ngn)}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {wallet.pending_ngn > 0 ? `${formatNgn(wallet.pending_ngn)} is on the way out` : "Available to withdraw"}
        </p>
        <div className="mt-3 flex gap-2">
          <Input
            className="min-h-11 rounded-xl"
            inputMode="decimal"
            placeholder="Amount"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
          />
          <Button
            className="min-h-11 shrink-0 rounded-xl bg-[#1F7A4D] font-extrabold text-white hover:bg-[#1F7A4D]/90"
            disabled={withdrawing}
            onClick={() => void withdraw()}
          >
            {withdrawing ? "Sending…" : "Withdraw"}
          </Button>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-extrabold">Shop receiving account</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Buyers transfer here. Money lands in the TIJAR wallet above — not your personal bank.
        </p>
        {accounts.length ? (
          <ul className="mt-3 space-y-3">
            {accounts.map((row) => (
              <li key={row.accountNumber} className="rounded-xl border border-border px-3 py-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Bank</span>
                  <span className="font-bold">{row.bankName}</span>
                </div>
                <div className="mt-1 flex justify-between gap-3">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-bold">{row.accountName || shopName}</span>
                </div>
                <div className="mt-1 flex justify-between gap-3">
                  <span className="text-muted-foreground">Number</span>
                  <span className="font-extrabold tracking-wide">{row.accountNumber}</span>
                </div>
                <Button
                  className="mt-2 min-h-11 w-full rounded-xl"
                  variant="outline"
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(row.accountNumber);
                    toast.success("Account number copied");
                  }}
                >
                  Copy account number
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <CreateReceivingAccountButton businessId={selected.id} shopName={shopName} />
        )}
      </section>

      <section className="mt-4 rounded-2xl border border-border bg-card p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Today’s shop sales</p>
        <p className="mt-1 text-3xl font-extrabold text-[#0B1F4D]">{formatNgn(todaySales)}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {pendingConfirms > 0
            ? `${pendingConfirms} transfer${pendingConfirms === 1 ? "" : "s"} waiting for you to confirm`
            : "Transfers into the shop account credit this wallet automatically"}
        </p>
        <Button className="mt-3 min-h-11 w-full rounded-xl" variant="outline" asChild>
          <Link to="/app/orders">Open orders</Link>
        </Button>
      </section>

      <section className="mt-4 rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-extrabold">Cash-out bank for {shopName}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          This is where withdrawals go. Buyers do not see this number once the shop account exists.
        </p>
        <BankAccountForm key={selected.id} business={selected} />
      </section>

      <section className="mt-4">
        <h2 className="text-sm font-extrabold">Incoming payments</h2>
        {credits.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Transfers into the shop account and online checkout payments will show here.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {credits.map((row) => (
              <li key={row.id} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-bold">Payment received</span>
                  <span className="text-[11px] text-muted-foreground">
                    {row.provider}
                    {row.account_number ? ` · ${row.account_number}` : ""}
                    {" · "}
                    {new Date(row.created_at).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                </span>
                <span className="shrink-0 font-extrabold text-[#1F7A4D]">+{formatNgn(Number(row.amount_ngn))}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4">
        <h2 className="text-sm font-extrabold">Withdrawals</h2>
        {requests.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No withdrawal requests yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {requests.map((row) => (
              <li key={row.id} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">
                <span>
                  <span className="block font-bold">{formatNgn(Number(row.amount_ngn))}</span>
                  <span className="text-[11px] text-muted-foreground">{row.status}</span>
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {new Date(row.created_at).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4 pb-8">
        <h2 className="text-sm font-extrabold">Shop sales ledger</h2>
        {salesQuery.isLoading ? (
          <p className="mt-2 text-sm text-muted-foreground">Loading sales…</p>
        ) : shopSales.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No recorded shop sales yet. Incoming transfers still appear under payments above.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {shopSales.map((row) => (
              <li key={row.id} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-bold">{row.description || "Shop sale"}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(row.occurred_at).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}
                    {row.payment_method ? ` · ${row.payment_method}` : ""}
                  </span>
                </span>
                <span className="shrink-0 font-extrabold text-[#1F7A4D]">{formatNgn(Number(row.amount))}</span>
              </li>
            ))}
          </ul>
        )}
        <Button className="mt-3 min-h-11 w-full rounded-xl" variant="outline" asChild>
          <Link to="/app/transactions">All transactions</Link>
        </Button>
      </section>
    </>
  );
}
