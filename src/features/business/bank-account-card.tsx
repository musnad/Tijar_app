"use client";

import { Link } from "@tanstack/react-router";
import { Landmark, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BankAccountForm } from "@/features/business/bank-account-form";
import { displayShopName } from "@/lib/shop-names";
import type { Business } from "@/types/database";

export function BankAccountCard({ business }: { business: Business }) {
  const va = business.virtual_account_number?.trim() ?? "";
  const cashOut = business.payout_account_number?.trim() ?? "";
  const hasVa = va.length >= 8;
  const saved = cashOut.length >= 8;
  const shop = displayShopName(business.business_name);

  return (
    <section className="mt-4 overflow-hidden rounded-2xl border-2 border-[#1F7A4D] bg-[#1F7A4D]/8 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#1F7A4D] text-white">
          <Wallet className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#1F7A4D]">Shop wallet</p>
          <p className="mt-0.5 text-base font-extrabold text-[#0B1F4D]">
            {hasVa ? "Buyers pay the TIJAR shop account" : "Open a TIJAR wallet to receive payments"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasVa
              ? `Money for ${shop} lands in the in-app wallet. Withdraw to the cash-out bank below.`
              : `Create a receiving account, then request withdrawals from Wallet & payouts.`}
          </p>
        </div>
      </div>
      {hasVa ? (
        <dl className="mt-3 space-y-0.5 rounded-xl bg-white/80 px-3 py-2 text-sm">
          {business.virtual_account_bank_name ? (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Receiving bank</dt>
              <dd className="font-bold text-[#0B1F4D]">{business.virtual_account_bank_name}</dd>
            </div>
          ) : null}
          {business.virtual_account_name ? (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Name</dt>
              <dd className="truncate font-bold text-[#0B1F4D]">{business.virtual_account_name}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Number</dt>
            <dd className="font-extrabold tracking-wide text-[#0B1F4D]">{va}</dd>
          </div>
        </dl>
      ) : null}
      <Button className="mt-3 min-h-11 w-full rounded-xl bg-[#0B1F4D] font-extrabold text-white" asChild>
        <Link to="/app/business/payouts">Open wallet & withdrawals</Link>
      </Button>

      <div className="mt-4 flex items-start gap-2">
        <Landmark className="mt-0.5 size-4 shrink-0 text-[#1F7A4D]" />
        <p className="text-sm font-extrabold text-[#0B1F4D]">
          {saved ? "Cash-out bank for withdrawals" : "Add the bank you want to withdraw to"}
        </p>
      </div>
      {saved ? (
        <dl className="mt-2 space-y-0.5 rounded-xl bg-white/80 px-3 py-2 text-sm">
          {business.payout_bank_name ? (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Bank</dt>
              <dd className="font-bold text-[#0B1F4D]">{business.payout_bank_name}</dd>
            </div>
          ) : null}
          {business.payout_account_name ? (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Name</dt>
              <dd className="truncate font-bold text-[#0B1F4D]">{business.payout_account_name}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Number</dt>
            <dd className="font-extrabold tracking-wide text-[#0B1F4D]">{cashOut}</dd>
          </div>
        </dl>
      ) : null}
      <BankAccountForm business={business} />
    </section>
  );
}
