"use client";

import { Link, useNavigate } from "@tanstack/react-router";
import { Heart, Plus, Store } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/features/auth/auth-context";
import { isMockFeedId } from "@/features/marketplace/feed-mock";
import { haptic } from "@/lib/haptics";
import { ensureSavedProduct, isProductLiked, likeProduct } from "@/lib/shop-social";
import { useDoubleTap } from "@/lib/use-double-tap";
import { addToCart, likeMarketplaceProduct } from "@/services/marketplace-service";
import { formatNgn } from "@/utils/money";
import type { PublicProduct } from "@/types/database";
import { formatPricePerUnit } from "@/lib/catalogue/units";
import { formatServiceDates, serviceLabel } from "@/lib/catalogue/service-schedule";
import { displayShopName, shopLinkSlug } from "@/lib/shop-names";
import { FeedImage } from "@/components/media/feed-image";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/context";

export function ProductCard({
  product,
  compact = false,
}: {
  product: PublicProduct;
  compact?: boolean;
}) {
  const { profile, session } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const actorId = profile?.id ?? "guest";
  const [burst, setBurst] = useState(false);

  function burstLike() {
    if (isMockFeedId(product.id)) return;
    haptic("success");
    setBurst(true);
    window.setTimeout(() => setBurst(false), 650);
    if (isProductLiked(actorId, product.id)) return;
    likeProduct(actorId, product.id);
    if (profile?.id) {
      void likeMarketplaceProduct(profile.id, product.id).then(({ error }) => {
        if (error) toast.error(error);
        else {
          queryClient.setQueryData(["product-likes", profile.id], (prev: Set<string> | undefined) => {
            const copy = new Set(prev ?? []);
            copy.add(product.id);
            return copy;
          });
        }
      });
    }
  }

  const onPhotoTap = useDoubleTap(burstLike, () => {
    void navigate({ to: "/shop/p/$productId", params: { productId: product.id } });
  });

  async function quickAdd(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!session || !profile) {
      toast.message("Sign in to add items to your cart.");
      return;
    }
    if (product.sale_price == null) {
      toast.message("This product has no price yet.");
      return;
    }
    ensureSavedProduct(profile.id, product);
    if (isMockFeedId(product.id)) {
      toast.error("This listing is not available.");
      return;
    }
    const { error } = await addToCart(profile.id, {
      businessId: product.business_id,
      productId: product.id,
      productName: product.name,
      unit: product.unit,
      unitPrice: Number(product.sale_price),
      imageUrl: product.image_url,
    });
    if (error) toast.error(error);
    else {
      toast.success("Added to cart and Saved Products");
      void queryClient.invalidateQueries({ queryKey: ["marketplace-cart"] });
      void queryClient.invalidateQueries({ queryKey: ["marketplace-favorites"] });
    }
  }

  return (
    <Link
      to="/shop/p/$productId"
      params={{ productId: product.id }}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_1px_2px_rgba(15,40,50,0.04)] will-change-transform transition-transform duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md",
        compact && "rounded-xl",
      )}
    >
      <div
        className={cn("relative overflow-hidden bg-muted", compact ? "aspect-[4/3]" : "aspect-square")}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onPhotoTap();
        }}
      >
        {product.image_url ? (
          <FeedImage
            src={product.image_url}
            alt=""
            width={compact ? 360 : 480}
            className="size-full object-cover will-change-transform transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1 bg-[linear-gradient(145deg,oklch(0.96_0.02_175),oklch(0.93_0.03_195))] text-muted-foreground">
            <Store className="size-7 opacity-50" />
            <span className="text-[10px] font-semibold">No photo</span>
          </div>
        )}
        {(product.kind === "service" || product.category_name || product.attributes?.badge) && (
          <span className="absolute left-2 top-2 rounded-full bg-background/95 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary shadow-sm">
            {product.kind === "service"
              ? serviceLabel(product)
              : product.attributes?.badge?.trim() || product.category_name}
          </span>
        )}
        {burst ? (
          <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <Heart className="size-16 fill-white text-white drop-shadow-lg" />
          </span>
        ) : null}
        <button
          type="button"
          aria-label={`Add ${product.name} to cart`}
          className="absolute bottom-2 right-2 flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition hover:scale-105 active:scale-95"
          onClick={(e) => void quickAdd(e)}
        >
          <Plus className="size-4" strokeWidth={2.75} />
        </button>
      </div>
      <div className={cn("flex flex-1 flex-col", compact ? "p-2" : "p-2.5")}>
        <p className="line-clamp-2 text-[13px] font-bold leading-snug text-foreground">{product.name}</p>
        <p className="mt-1 text-[15px] font-extrabold tracking-tight text-primary">
          {product.sale_price != null ? formatPricePerUnit(Number(product.sale_price), product.unit, formatNgn) : "Ask seller"}
        </p>
        {formatServiceDates(product) && (
          <p className="mt-0.5 truncate text-[10px] font-semibold text-muted-foreground">
            {formatServiceDates(product)}
          </p>
        )}
        <p
          className="mt-1 truncate text-[11px] font-medium text-muted-foreground underline-offset-2 hover:underline"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const slug = shopLinkSlug(product.business_slug, product.business_id);
            if (slug) void navigate({ to: "/b/$slug", params: { slug } });
          }}
        >
          {displayShopName(product.business_name)}
        </p>
        {product.sale_price != null ? (
          <button
            type="button"
            className="mt-2 min-h-9 w-full rounded-full bg-primary text-[11px] font-extrabold text-white"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (isMockFeedId(product.id)) {
                toast.error("This listing is not available.");
                return;
              }
              void navigate({ to: "/shop/buy", search: { productId: product.id } });
            }}
          >
            {t("shop.feed.buyNow")}
          </button>
        ) : null}
      </div>
    </Link>
  );
}
