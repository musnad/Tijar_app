"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Eye, EyeOff, Lock, Wallet } from "lucide-react";
import { useState } from "react";

import { WalletPinDialog, type WalletPinMode } from "@/features/business/wallet-pin-dialog";
import { fetchVirtualAccountWallet } from "@/services/marketplace-service";
import { formatNgn } from "@/utils/money";

const HIDE_KEY = "tijar-hide-wallet-balance";

function readHidden(): boolean {
  try {
    return localStorage.getItem(HIDE_KEY) === "1";
  } catch {
    return false;
  }
}

export function ProfileWalletCard({ businessId }: { businessId: string }) {
  const queryClient = useQueryClient();
  const [hideBalance, setHideBalance] = useState(readHidden);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinMode, setPinMode] = useState<WalletPinMode>("create");

  const walletQuery = useQuery({
    queryKey: ["shop-wallet", businessId],
    queryFn: () => fetchVirtualAccountWallet(businessId),
  });
  const hasPin = Boolean(walletQuery.data?.hasTransferPin);
  const available = walletQuery.data?.wallet.available_ngn ?? 0;

  function toggleBalance() {
    setHideBalance((v) => {
      const next = !v;
      try {
        localStorage.setItem(HIDE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function openPin(mode: WalletPinMode) {
    setPinMode(mode);
    setPinOpen(true);
  }

  return (
    <section className="mx-5 mt-4 overflow-hidden rounded-[1.4rem] bg-[linear-gradient(145deg,#041830_0%,#0B1F4D_55%,#163a7a_100%)] p-4 text-white shadow-md">
      <div className="flex items-center justify-between">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/75">
          <Wallet className="size-3.5" /> TIJAR wallet
        </p>
        <button type="button" onClick={toggleBalance} className="text-white/80" aria-label={hideBalance ? "Show balance" : "Hide balance"}>
          {hideBalance ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      <p className="mt-2 text-3xl font-extrabold tracking-tight">{hideBalance ? "₦••••••" : formatNgn(available)}</p>
      <p className="mt-1 text-[11px] text-white/70">
        {hasPin ? "PIN protects withdrawals." : "Create a PIN before you send money out."}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {hasPin ? (
          <>
            <button
              type="button"
              className="min-h-10 rounded-xl bg-white/12 text-[12px] font-extrabold"
              onClick={() => openPin("change")}
            >
              Change PIN
            </button>
            <button
              type="button"
              className="min-h-10 rounded-xl bg-white/12 text-[12px] font-extrabold"
              onClick={() => openPin("forget")}
            >
              Forgot PIN
            </button>
          </>
        ) : (
          <button
            type="button"
            className="min-h-10 rounded-xl bg-[#1F7A4D] text-[12px] font-extrabold"
            onClick={() => openPin("create")}
          >
            <Lock className="mr-1 inline size-3.5" />
            Create PIN
          </button>
        )}
        <button
          type="button"
          className={`min-h-10 rounded-xl bg-white/12 text-[12px] font-extrabold ${hasPin ? "col-span-2" : ""}`}
          onClick={toggleBalance}
        >
          {hideBalance ? "Show PIN" : "Hide PIN"}
        </button>
      </div>
      <Link to="/shop/payouts" className="mt-3 block text-center text-[12px] font-bold text-white/80 underline-offset-2 hover:underline">
        Open wallet
      </Link>
      <WalletPinDialog
        open={pinOpen}
        onOpenChange={setPinOpen}
        mode={pinMode}
        businessId={businessId}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["shop-wallet", businessId] })}
      />
    </section>
  );
}
