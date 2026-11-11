import { toast } from "sonner";

import { isMockFeedId } from "@/features/marketplace/feed-mock";
import { ensureSavedProduct } from "@/lib/shop-social";
import { addToCart } from "@/services/marketplace-service";
import type { PublicProduct } from "@/types/database";

export const CART_QUERY_KEY = "marketplace-cart";

export function cartActorId(profileId?: string | null): string {
  return profileId?.trim() || "guest";
}

export function toastAddedToCart(openCart?: () => void): void {
  toast.success("Added to cart", {
    description: "Open Cart whenever you are ready to pay.",
    action: {
      label: "View cart",
      onClick: () => {
        if (openCart) {
          openCart();
          return;
        }
        window.location.assign("/shop/cart");
      },
    },
  });
}

export async function addProductToBuyerCart(
  actorId: string,
  product: Pick<PublicProduct, "id" | "business_id" | "name" | "unit" | "sale_price" | "image_url">,
  quantity = 1,
): Promise<{ error: string | null }> {
  if (isMockFeedId(product.id)) return { error: "This listing is not available." };
  if (product.sale_price == null) return { error: "This product has no price yet." };
  ensureSavedProduct(actorId, product as PublicProduct);
  return addToCart(actorId, {
    businessId: product.business_id,
    productId: product.id,
    productName: product.name,
    unit: product.unit,
    unitPrice: Number(product.sale_price),
    quantity,
    imageUrl: product.image_url,
  });
}
