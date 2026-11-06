import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { useAuth } from "@/features/auth/auth-context";
import { haptic } from "@/lib/haptics";
import { openShopConversation } from "@/services/shop-chat-service";

export function useStartShopChat() {
  const { session, profile } = useAuth();
  const navigate = useNavigate();

  return async (input: {
    businessId: string;
    businessName?: string | null;
    logoUrl?: string | null;
    businessSlug?: string | null;
    productId?: string | null;
  }) => {
    haptic();
    if (!session || !profile) {
      toast.message("Sign in to message this shop.");
      void navigate({ to: "/login" });
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
