"use client";

import { Building2, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { confirmShopPayment, fetchShopReceivingAccount } from "@/services/shop-pay-service";
import { formatNgn } from "@/utils/money";

const WINDOW_MS = 15 * 60 * 1000;

function timerKey(orderId: string) {
  return `tijar-pay-timer-${orderId}`;
}

function remainingMs(orderId: string): number {
  if (typeof window === "undefined") return 0;
  const raw = sessionStorage.getItem(timerKey(orderId));
  if (!raw) return 0;
  const started = Number(raw);
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, started + WINDOW_MS - Date.now());
}

function formatClock(ms: number) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ShopPayPanel({
  businessId,
  amount,
  orderId,
  kind,
  itemLabel,
  onPaid,
}: {
  businessId: string;
  amount: number;
  orderId: string;
  kind: "place_order" | "marketplace" | "bid";
  itemLabel: string;
  onPaid?: () => void;
}) {
  const [account, setAccount] = useState<{ accountNumber: string; accountName: string; bankName: string } | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    let live = true;
    void fetchShopReceivingAccount(businessId).then((row) => {
      if (live) setAccount(row.account);
    });
    const existing = remainingMs(orderId);
    if (existing > 0) {
      setCopied(true);
      setLeft(existing);
    }
    return () => {
      live = false;
    };
  }, [businessId, orderId]);

  useEffect(() => {
    if (!copied || paid) return;
    const id = window.setInterval(() => setLeft(remainingMs(orderId)), 1000);
    return () => window.clearInterval(id);
  }, [copied, orderId, paid]);

  async function copyNumber() {
    if (!account?.accountNumber) return;
    await navigator.clipboard.writeText(account.accountNumber);
    sessionStorage.setItem(timerKey(orderId), String(Date.now()));
    setCopied(true);
    setLeft(WINDOW_MS);
    toast.success("Account number copied. You have 15 minutes to pay.");
  }

  async function confirmPaid() {
    setBusy(true);
    const started = sessionStorage.getItem(timerKey(orderId));
    const result = await confirmShopPayment({
      businessId,
      amount,
      orderId,
      kind,
      itemLabel,
      watchedFrom: started ? new Date(Number(started)).toISOString() : undefined,
    });
    setBusy(false);
    if (result.error || !result.paid) {
      toast.error(result.error ?? "Payment is not on the shop account yet.");
      return;
    }
    setPaid(true);
    toast.success("Payment confirmed. The shop has been notified.");
    onPaid?.();
  }

  if (account === undefined) {
    return (
      <div className="mt-3 rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-extrabold">Pay this shop</p>
        <p className="mt-1 text-xs text-muted-foreground">Loading shop virtual account…</p>
      </div>
    );
  }
  if (!account) {
    return (
      <div className="mt-3 rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-extrabold">Pay this shop</p>
        <p className="mt-1 text-xs text-muted-foreground">This shop has not opened a virtual account yet.</p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-[#1F7A4D]/30 bg-[#F4FBF7] p-4">
      <p className="flex items-center gap-1.5 text-sm font-extrabold text-[#0B1F4D]">
        <Building2 className="size-4" /> Transfer {formatNgn(amount)}
      </p>
      <p className="mt-1 text-[12px] text-muted-foreground">
        Copy the shop virtual account, send the total from your bank, then tap I’ve made the payment.
      </p>
      <dl className="mt-3 space-y-1 text-[13px]">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Bank</dt>
          <dd className="font-bold">{account.bankName}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Name</dt>
          <dd className="font-bold">{account.accountName}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Account number</dt>
          <dd className="font-extrabold tracking-wide">{account.accountNumber}</dd>
        </div>
      </dl>
      <Button type="button" variant="outline" className="mt-3 min-h-11 w-full rounded-xl font-bold" onClick={() => void copyNumber()}>
        <Copy className="mr-2 size-4" />
        Copy account number
      </Button>
      {copied ? (
        <>
          <p className={`mt-3 text-center text-sm font-extrabold ${left > 0 ? "text-[#1F7A4D]" : "text-amber-700"}`}>
            {left > 0 ? `Pay within ${formatClock(left)}` : "15 minutes ended — you can still confirm if the transfer went through."}
          </p>
          <Button
            type="button"
            className="mt-2 min-h-12 w-full rounded-xl bg-[#1F7A4D] font-extrabold text-white hover:bg-[#1F7A4D]/90"
            disabled={busy || paid}
            onClick={() => void confirmPaid()}
          >
            {paid ? "Paid" : busy ? "Checking shop account…" : "I’ve made the payment"}
          </Button>
        </>
      ) : null}
    </div>
  );
}
