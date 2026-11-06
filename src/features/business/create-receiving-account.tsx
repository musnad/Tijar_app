"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { provisionVirtualAccount } from "@/services/marketplace-service";

export function CreateReceivingAccountButton({
  businessId,
  shopName,
}: {
  businessId: string;
  shopName: string;
}) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [idType, setIdType] = useState<"bvn" | "nin">("bvn");
  const [idNumber, setIdNumber] = useState("");

  async function create() {
    const digits = idNumber.replace(/\D/g, "");
    if (digits.length !== 11) {
      toast.error(`Enter the shop owner’s 11-digit ${idType.toUpperCase()}.`);
      return;
    }
    setCreating(true);
    const result = await provisionVirtualAccount(businessId, { idType, idNumber: digits });
    setCreating(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Receiving account opened as ${shopName}.`);
    await queryClient.invalidateQueries({ queryKey: ["primary-business"] });
    await queryClient.invalidateQueries({ queryKey: ["shop-wallet", businessId] });
    await queryClient.invalidateQueries({ queryKey: ["owned-businesses"] });
  }

  return (
    <div className="mt-3 space-y-2">
      <p className="text-sm text-muted-foreground">
        Account name will be <span className="font-bold text-foreground">{shopName}</span>. Corv needs BVN or NIN to issue the NUBAN.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className={`min-h-11 flex-1 rounded-xl border text-sm font-bold ${idType === "bvn" ? "border-[#0B1F4D] bg-[#0B1F4D] text-white" : "border-input bg-background"}`}
          onClick={() => setIdType("bvn")}
        >
          BVN
        </button>
        <button
          type="button"
          className={`min-h-11 flex-1 rounded-xl border text-sm font-bold ${idType === "nin" ? "border-[#0B1F4D] bg-[#0B1F4D] text-white" : "border-input bg-background"}`}
          onClick={() => setIdType("nin")}
        >
          NIN
        </button>
      </div>
      <Input
        className="min-h-11 rounded-xl"
        inputMode="numeric"
        maxLength={11}
        placeholder={`${idType.toUpperCase()} · 11 digits`}
        value={idNumber}
        onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, "").slice(0, 11))}
      />
      <Button
        className="min-h-11 w-full rounded-xl bg-[#0B1F4D] font-extrabold text-white"
        disabled={creating}
        type="button"
        onClick={() => void create()}
      >
        {creating ? "Opening account…" : "Create account"}
      </Button>
    </div>
  );
}
