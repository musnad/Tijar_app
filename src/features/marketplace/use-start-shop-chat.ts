import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { useAuth } from "@/features/auth/auth-context";
import { useAccountGate } from "@/features/auth/account-gate";
import { haptic } from "@/lib/haptics";
import { openShopConversation } from "@/services/shop-chat-service";

export function useStartShopChat() {
  const { profile } = useAuth();
  const { requireAccount } = useAccountGate();
  const navigate = useNavigate();

  return async (input: {
    businessId: string;
    businessName?: string | null;
    logoUrl?: string | null;
    businessSlug?: string | null;
    productId?: string | null;
  }) => {
    haptic();
    if (!requireAccount("generic") || !profile) {
      return;
    }
    const r = await openShopConversation({
      customerId: profile.id,
      businessId: input.businessId,
      businessName: input.businessName,
      logoUrl: input.logoUrl,
      businessSlug: input.businessSlug,
      productId: input.productId,
    });
    if (r.error || !r.id) {
      toast.error(r.error ?? "Could not open chat.");
      return;
    }
    void navigate({ to: "/shop/enquiries/$conversationId", params: { conversationId: r.id } });
  };
}
