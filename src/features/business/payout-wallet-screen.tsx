"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, Copy, Eye, EyeOff, Lock, RefreshCw, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CreateReceivingAccountButton } from "@/features/business/create-receiving-account";
import { NG_BANKS } from "@/lib/payments/ng-banks";
import { displayShopName } from "@/lib/shop-names";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchOwnedBusinesses } from "@/services/business-service";
import {
  fetchSellerWallet,
  fetchVirtualAccountWallet,
  requestSellerPayout,
  saveSellerTransferPin,
} from "@/services/marketplace-service";
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

  const walletQuery = useQuery({
    queryKey: ["shop-wallet", selected.id],
    refetchInterval: 12_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
    queryFn: async () => {
      const [va, ledger] = await Promise.all([
        fetchVirtualAccountWallet(selected.id),
        fetchSellerWallet(selected.id),
      ]);
      return {
        configured: va.configured,
        account: va.account,
        accounts: va.accounts,
        wallet: va.wallet,
        requests: ledger.requests,
        credits: va.credits,
        activity: va.activity,
        payout: va.payout,
        hasTransferPin: va.hasTransferPin,
        error: va.error || ledger.error,
      };
    },
  });

  const [hide, setHide] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [accountName, setAccountName] = useState(selected.payout_account_name ?? "");
  const [accountNumber, setAccountNumber] = useState(selected.payout_account_number ?? "");
  const [bankCode, setBankCode] = useState(selected.payout_bank_code ?? "058");
  const [resolving, setResolving] = useState(false);
  const [pinStep, setPinStep] = useState<"withdraw" | "set" | "create" | "change" | null>(null);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [pinBusy, setPinBusy] = useState(false);

  const shopName = displayShopName(selected.business_name);
  const account = walletQuery.data?.account;
  const accounts = walletQuery.data?.accounts?.length
    ? walletQuery.data.accounts
    : account
      ? [account]
      : [];
  const wallet = walletQuery.data?.wallet ?? { available_ngn: 0, pending_ngn: 0 };
  const requests = walletQuery.data?.requests ?? [];
  const activity = walletQuery.data?.activity ?? [];
  const bank = NG_BANKS.find((row) => row.code === bankCode);
  const hasTransferPin = Boolean(walletQuery.data?.hasTransferPin);

  const feed = useMemo(() => {
    const rows: Array<{
      id: string;
      title: string;
      detail: string;
      amount: number;
      at: number;
      direction: "in" | "out";
    }> = [];
    const owned = new Set(accounts.map((row) => row.accountNumber.replace(/\D/g, "")).filter((n) => n.length >= 8));
    for (const row of activity) {
      const nuban = (row.accountNumber ?? "").replace(/\D/g, "");
      const feeLine = !nuban && /fee/i.test(row.description ?? "");
      if (!feeLine && (!owned.size || !owned.has(nuban))) continue;
      rows.push({
        id: `corv-${row.reference}`,
        title: row.description,
        detail: row.accountNumber ?? "This shop account",
        amount: row.amount,
        at: row.createdAt ? new Date(row.createdAt).getTime() : 0,
        direction: row.direction,
      });
    }
    for (const row of requests) {
      rows.push({
        id: row.id,
        title: row.status === "paid" ? "Sent to bank" : `Withdrawal ${row.status}`,
        detail: row.note ?? "Bank transfer",
        amount: Number(row.amount_ngn),
        at: new Date(row.created_at).getTime(),
        direction: "out",
      });
    }
    return rows.sort((a, b) => b.at - a.at).slice(0, 40);
  }, [accounts, activity, requests]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["shop-wallet", selected.id] });
    toast.success("Wallet updated from Corvi.");
  }

  async function lookupName(number: string, code: string) {
    if (number.replace(/\D/g, "").length !== 10) return;
    const supabase = getSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    setResolving(true);
    try {
      const res = await fetch(
        `/api/payments/payout?businessId=${encodeURIComponent(selected.id)}&accountNumber=${encodeURIComponent(number)}&bankCode=${encodeURIComponent(code)}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      );
      const json = (await res.json()) as { accountName?: string | null };
      if (json.accountName) setAccountName(json.accountName);
    } catch {
      /* keep typed name */
    }
    setResolving(false);
  }

  function resetPinFields() {
    setPin("");
    setConfirmPin("");
    setCurrentPin("");
  }

  function readyToWithdraw(): boolean {
    const amount = Number(withdrawAmount.replace(/[₦,\s]/g, ""));
    if (!Number.isFinite(amount) || amount < 100) {
      toast.error("Enter at least ₦100.");
      return false;
    }
    if (amount > wallet.available_ngn && wallet.available_ngn > 0) {
      toast.error(`You can withdraw up to ${formatNgn(wallet.available_ngn)}.`);
      return false;
    }
    if (accountNumber.replace(/\D/g, "").length < 8) {
      toast.error("Enter the bank account number to send to.");
      return false;
    }
    return true;
  }

  function startWithdraw() {
    if (!readyToWithdraw()) return;
    resetPinFields();
    setPinStep(hasTransferPin ? "withdraw" : "set");
  }

  async function withdrawWithPin(transferPin: string) {
    const amount = Number(withdrawAmount.replace(/[₦,\s]/g, ""));
    setWithdrawing(true);
    try {
      const result = await requestSellerPayout(
        selected.id,
        amount,
        {
          accountNumber,
          accountName: accountName || shopName,
          bankCode,
          bankName: bank?.name ?? "Bank",
        },
        transferPin,
      );
      if (result.error) {
        toast.error(result.error);
        return false;
      }
      toast.success(result.message ?? "Transfer sent.");
      setWithdrawAmount("");
      setPinStep(null);
      resetPinFields();
      await queryClient.invalidateQueries({ queryKey: ["shop-wallet", selected.id] });
      return true;
    } catch {
      toast.error("Withdrawal did not complete. Try again.");
      return false;
    } finally {
      setWithdrawing(false);
    }
  }

  async function savePinAndMaybeWithdraw() {
    if (pin.length !== 4 || confirmPin.length !== 4) {
      toast.error("Enter a 4-digit PIN twice.");
      return;
    }
    if (pin !== confirmPin) {
      toast.error("Those PINs do not match.");
      return;
    }
    if (pinStep === "change" && currentPin.length !== 4) {
      toast.error("Enter your current PIN.");
      return;
    }
    setPinBusy(true);
    try {
      const result = await saveSellerTransferPin(selected.id, {
        pin,
        confirmPin,
        currentPin: pinStep === "change" ? currentPin : undefined,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Transfer PIN saved.");
      await queryClient.invalidateQueries({ queryKey: ["shop-wallet", selected.id] });
      if (pinStep === "set") {
        await withdrawWithPin(pin);
        return;
      }
      setPinStep(null);
      resetPinFields();
    } finally {
      setPinBusy(false);
    }
  }

  return (
    <div className="pb-10">
      <div className="mt-2 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">TIJAR Wallet</p>
          <h1 className="text-xl font-extrabold text-[#0B1F4D]">{shopName}</h1>
        </div>
        <button
          type="button"
          className="flex size-10 items-center justify-center rounded-full border border-border"
          onClick={() => void refresh()}
          aria-label="Refresh wallet"
        >
          <RefreshCw className="size-4" />
        </button>
      </div>

      {shops.length > 1 ? (
        <select
          className="mt-3 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-semibold"
          value={selected.id}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          {shops.map((s) => (
            <option key={s.id} value={s.id}>
              {displayShopName(s.business_name)}
            </option>
          ))}
        </select>
      ) : null}

      <section className="relative mt-4 overflow-hidden rounded-[1.6rem] bg-[linear-gradient(145deg,#041830_0%,#0B1F4D_55%,#163a7a_100%)] p-5 text-white shadow-lg">
        <div className="absolute -right-8 -top-10 size-32 rounded-full bg-white/10" />
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-white/80">
            <Wallet className="size-4" /> Available balance
          </span>
          <button type="button" onClick={() => setHide((v) => !v)} className="text-white/80" aria-label="Hide balance">
            {hide ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <p className="mt-3 text-4xl font-extrabold tracking-tight">
          {hide ? "₦••••••" : formatNgn(wallet.available_ngn)}
        </p>
        <p className="mt-1 text-xs text-white/70">
          {wallet.pending_ngn > 0 ? `${formatNgn(wallet.pending_ngn)} pending` : "Balance after TIJAR’s 3% fee on paid sales (min ₦50)"}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button
            className="min-h-11 rounded-xl bg-white font-extrabold text-[#0B1F4D] hover:bg-white/90"
            onClick={() => {
              const el = document.getElementById("tijar-receive");
              el?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            Receive
          </Button>
          <Button
            type="button"
            className="min-h-11 rounded-xl bg-[#1F7A4D] font-extrabold text-white hover:bg-[#1F7A4D]/90"
            onClick={() => {
              const saved = walletQuery.data?.payout;
              if (saved?.accountNumber) setAccountNumber(saved.accountNumber);
              if (saved?.accountName) setAccountName(saved.accountName);
              if (saved?.bankCode) setBankCode(saved.bankCode);
              if (!withdrawAmount && wallet.available_ngn > 0) setWithdrawAmount(String(wallet.available_ngn));
              document.getElementById("tijar-withdraw")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            Withdraw
          </Button>
        </div>
      </section>

      <section id="tijar-receive" className="mt-4 rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-extrabold">Receiving account</h2>
        <p className="mt-1 text-xs text-muted-foreground">Buyers transfer here. It shows on Corvi and in this wallet.</p>
        {accounts.length ? (
          <ul className="mt-3 space-y-3">
            {accounts.map((row) => (
              <li key={row.accountNumber} className="rounded-2xl bg-[#0B1F4D] p-4 text-white">
                <p className="text-[11px] uppercase tracking-wide text-white/70">{row.bankName}</p>
                <p className="mt-1 text-lg font-extrabold tracking-[0.18em]">{row.accountNumber}</p>
                <p className="mt-1 text-sm text-white/80">{row.accountName || shopName}</p>
                <Button
                  className="mt-3 min-h-10 w-full rounded-xl bg-white/15 text-white hover:bg-white/25"
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(row.accountNumber);
                    toast.success("Account number copied");
                  }}
                >
                  <Copy className="mr-2 size-4" />
                  Copy number
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <CreateReceivingAccountButton businessId={selected.id} shopName={shopName} />
        )}
      </section>

      <section className="mt-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#0B1F4D]/8 text-[#0B1F4D]">
            <Lock className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-extrabold">Transfer PIN</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {hasTransferPin
                ? "Required to send money out of this wallet."
                : "Set a 4-digit PIN before you can withdraw."}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="min-h-10 shrink-0 rounded-xl font-bold"
            onClick={() => {
              resetPinFields();
              setPinStep(hasTransferPin ? "change" : "create");
            }}
          >
            {hasTransferPin ? "Change" : "Set PIN"}
          </Button>
        </div>
      </section>

      <section id="tijar-withdraw" className="mt-4 rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-extrabold">Withdraw to any bank</h2>
        <p className="mt-1 text-xs text-muted-foreground">Send money from this wallet to a Nigerian bank account. You will enter your transfer PIN to confirm.</p>
        <label className="mt-3 block text-xs font-bold">Amount</label>
        <Input
          className="mt-1 min-h-11 rounded-xl"
          inputMode="decimal"
          placeholder="₦0.00"
          value={withdrawAmount}
          onChange={(e) => setWithdrawAmount(e.target.value)}
        />
        <label className="mt-3 block text-xs font-bold">Bank</label>
        <select
          className="mt-1 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-semibold"
          value={bankCode}
          onChange={(e) => {
            setBankCode(e.target.value);
            void lookupName(accountNumber, e.target.value);
          }}
        >
          {NG_BANKS.map((row) => (
            <option key={row.code} value={row.code}>
              {row.name}
            </option>
          ))}
        </select>
        <label className="mt-3 block text-xs font-bold">Account number</label>
        <Input
          className="mt-1 min-h-11 rounded-xl tracking-wide"
          inputMode="numeric"
          value={accountNumber}
          onChange={(e) => {
            const next = e.target.value.replace(/\D/g, "").slice(0, 10);
            setAccountNumber(next);
            if (next.length === 10) void lookupName(next, bankCode);
          }}
        />
        <label className="mt-3 block text-xs font-bold">Account name</label>
        <Input
          className="mt-1 min-h-11 rounded-xl"
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
          placeholder={resolving ? "Looking up account…" : "Name on the account"}
        />
        <Button
          type="button"
          className="mt-3 min-h-11 w-full rounded-xl bg-[#1F7A4D] font-extrabold text-white hover:bg-[#1F7A4D]/90"
          disabled={withdrawing}
          onClick={() => startWithdraw()}
        >
          {withdrawing ? "Sending…" : hasTransferPin ? "Send to bank" : "Set PIN and send"}
        </Button>
      </section>

      <section className="mt-4">
        <h2 className="text-sm font-extrabold">Transactions</h2>
        {walletQuery.isLoading ? (
          <p className="mt-2 text-sm text-muted-foreground">Updating from Corvi…</p>
        ) : feed.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No wallet movement yet. Transfer into the receiving account, then tap refresh.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {feed.map((row) => (
              <li key={row.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-3">
                <span
                  className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
                    row.direction === "in" ? "bg-[#1F7A4D]/12 text-[#1F7A4D]" : "bg-orange-100 text-orange-700"
                  }`}
                >
                  {row.direction === "in" ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{row.title}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {row.detail}
                    {row.at ? ` · ${new Date(row.at).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}` : ""}
                  </span>
                </span>
                <span className={`shrink-0 text-sm font-extrabold ${row.direction === "in" ? "text-[#1F7A4D]" : "text-[#0B1F4D]"}`}>
                  {row.direction === "in" ? "+" : "-"}
                  {formatNgn(row.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog
        open={pinStep !== null}
        onOpenChange={(open) => {
          if (!open && !withdrawing && !pinBusy) {
            setPinStep(null);
            resetPinFields();
          }
        }}
      >
        <DialogContent className="max-w-sm rounded-[1.4rem]">
          <DialogHeader>
            <DialogTitle>
              {pinStep === "withdraw"
                ? "Enter transfer PIN"
                : pinStep === "change"
                  ? "Change transfer PIN"
                  : "Set transfer PIN"}
            </DialogTitle>
            <DialogDescription>
              {pinStep === "withdraw"
                ? "This PIN confirms the withdrawal. TIJAR never shows it again."
                : "Use 4 digits. Do not use 1234 or the same number four times."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {pinStep === "change" ? (
              <PinField label="Current PIN" value={currentPin} onChange={setCurrentPin} />
            ) : null}
            {pinStep === "withdraw" ? (
              <PinField label="Transfer PIN" value={pin} onChange={setPin} />
            ) : (
              <>
                <PinField label={pinStep === "change" ? "New PIN" : "Create PIN"} value={pin} onChange={setPin} />
                <PinField label="Confirm PIN" value={confirmPin} onChange={setConfirmPin} />
              </>
            )}
            <Button
              type="button"
              className="min-h-11 w-full rounded-xl bg-[#1F7A4D] font-extrabold text-white hover:bg-[#1F7A4D]/90"
              disabled={withdrawing || pinBusy}
              onClick={() => {
                if (pinStep === "withdraw") void withdrawWithPin(pin);
                else void savePinAndMaybeWithdraw();
              }}
            >
              {withdrawing || pinBusy
                ? "Please wait…"
                : pinStep === "withdraw"
                  ? "Confirm withdrawal"
                  : pinStep === "set"
                    ? "Save PIN and send"
                    : "Save PIN"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PinField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold">{label}</span>
      <Input
        className="mt-1 min-h-12 rounded-xl text-center text-2xl font-extrabold tracking-[0.5em]"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={4}
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
      />
    </label>
  );
}
