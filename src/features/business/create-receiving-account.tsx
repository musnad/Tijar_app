"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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

  async function create() {
    setCreating(true);
    const result = await provisionVirtualAccount(businessId);
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
    <Button
      className="mt-3 min-h-11 w-full rounded-xl bg-[#0B1F4D] font-extrabold text-white"
      disabled={creating}
      type="button"
      onClick={() => void create()}
    >
      {creating ? "Opening account…" : "Create account"}
    </Button>
  );
}
