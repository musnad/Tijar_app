"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/auth-context";
import { NG_BANKS } from "@/lib/payments/ng-banks";
import { saveBusinessPayoutAccount } from "@/services/marketplace-service";
import type { Business } from "@/types/database";

export function BankAccountForm({ business }: { business: Business }) {
  const { profile, session } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState(business.payout_account_name ?? "");
  const [number, setNumber] = useState(business.payout_account_number ?? "");
  const [bankCode, setBankCode] = useState(business.payout_bank_code ?? "058");
  const [saving, setSaving] = useState(false);
  const bank = NG_BANKS.find((b) => b.code === bankCode);

  useEffect(() => {
    setName(business.payout_account_name ?? profile?.full_name ?? "");
    setNumber(business.payout_account_number ?? "");
    setBankCode(business.payout_bank_code ?? "058");
  }, [business.id, business.payout_account_name, business.payout_account_number, business.payout_bank_code, profile?.full_name]);

  async function saveAccount() {
    if (!session || !profile) {
      toast.error("Sign in to save this shop’s bank account.");
      return;
    }
    if (!name.trim() || number.replace(/\D/g, "").length < 8) {
      toast.error("Enter the account name and number.");
      return;
    }
    setSaving(true);
    const { error } = await saveBusinessPayoutAccount(
      business.id,
      {
        payout_account_name: name,
        payout_account_number: number,
        payout_bank_name: bank?.name ?? "Bank",
        payout_bank_code: bankCode,
      },
      profile.id,
    );
    setSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Cash-out bank saved. Withdrawals will go here.");
    await queryClient.invalidateQueries({ queryKey: ["primary-business"] });
    await queryClient.invalidateQueries({ queryKey: ["owned-businesses"] });
    await queryClient.invalidateQueries({ queryKey: ["payout-account", business.id] });
  }

  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        void saveAccount();
      }}
    >
      <label className="block text-xs font-bold text-[#0B1F4D]">Account name</label>
      <Input
        className="min-h-11 rounded-xl"
        value={name}
        autoComplete="name"
        placeholder="Name on the account"
        onChange={(e) => setName(e.target.value)}
      />
      <label className="block text-xs font-bold text-[#0B1F4D]">Account number</label>
      <Input
        className="min-h-11 rounded-xl tracking-wide"
        inputMode="numeric"
        autoComplete="off"
        placeholder="10-digit account number"
        value={number}
        onChange={(e) => setNumber(e.target.value.replace(/[^\d\s]/g, ""))}
      />
      <label className="block text-xs font-bold text-[#0B1F4D]">Bank</label>
      <select
        className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
        value={bankCode}
        onChange={(e) => setBankCode(e.target.value)}
      >
        {NG_BANKS.map((b) => (
          <option key={b.code} value={b.code}>
            {b.name}
          </option>
        ))}
      </select>
      <Button type="submit" className="min-h-11 w-full rounded-xl bg-[#1F7A4D] font-extrabold text-white hover:bg-[#1F7A4D]/90" disabled={saving}>
        {saving ? "Saving…" : business.payout_account_number ? "Save bank account" : "Add bank account"}
      </Button>
    </form>
  );
}
