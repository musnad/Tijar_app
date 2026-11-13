"use client";

import { Link, useNavigate } from "@tanstack/react-router";
import { Heart, ShoppingCart, Store } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/features/auth/auth-context";
import { isMockFeedId } from "@/features/marketplace/feed-mock";
import { haptic } from "@/lib/haptics";
import { CART_QUERY_KEY, addProductToBuyerCart, cartActorId, toastAddedToCart } from "@/lib/cart-actions";
import { isProductLiked, likeProduct } from "@/lib/shop-social";
import { useDoubleTap } from "@/lib/use-double-tap";
import { fetchMarketplaceProduct, likeMarketplaceProduct } from "@/services/marketplace-service";
import { formatNgn } from "@/utils/money";
import type { PublicProduct } from "@/types/database";
import { formatPricePerUnit } from "@/lib/catalogue/units";
import { formatServiceDates, serviceLabel } from "@/lib/catalogue/service-schedule";
import { displayShopName, shopLinkSlug } from "@/lib/shop-names";
import { FeedImage } from "@/components/media/feed-image";
import { cn } from "@/lib/utils";
import { isTijarNativeApp } from "@/lib/tijar-native-app";
import { useTranslation } from "@/lib/i18n/context";
import { useViewerLocation } from "@/hooks/use-viewer-location";
import { formatShopPlaceLine } from "@/lib/maps/shop-coords";

export function ProductCard({
  product,
  compact = false,
}: {
  product: PublicProduct;
  compact?: boolean;
}) {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const viewer = useViewerLocation(false);
  const place = formatShopPlaceLine(product, viewer.coords);
  const queryClient = useQueryClient();
  const actorId = cartActorId(profile?.id);
  const [burst, setBurst] = useState(false);
  const [adding, setAdding] = useState(false);

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

  const onPhotoTap = useDoubleTap(burstLike);
  const nativeApp = isTijarNativeApp();

  function prefetch() {
    void queryClient.prefetchQuery({
      queryKey: ["marketplace-product", product.id],
      queryFn: async () => {
        const res = await fetchMarketplaceProduct(product.id);
        if (res.error || !res.product) throw new Error(res.error ?? "Product not found");
        return res.product;
      },
      staleTime: 30_000,
    });
  }

  async function quickAdd() {
    haptic("success");
    if (product.sale_price == null) {
      toast.message("This product has no price yet.");
      return;
    }
    setAdding(true);
    const { error } = await addProductToBuyerCart(actorId, product);
    setAdding(false);
    if (error) toast.error(error);
    else {
      void queryClient.invalidateQueries({ queryKey: [CART_QUERY_KEY] });
      void queryClient.invalidateQueries({ queryKey: ["marketplace-favorites"] });
      toastAddedToCart(() => void navigate({ to: "/shop/cart" }));
    }
  }

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_1px_2px_rgba(15,40,50,0.04)] will-change-transform transition-transform duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md",
        compact && "rounded-xl",
        nativeApp &&
          "rounded-[22px] border-0 shadow-[0_10px_28px_rgba(11,31,58,0.08)] hover:translate-y-0 hover:border-0 hover:shadow-[0_10px_28px_rgba(11,31,58,0.08)]",
      )}
    >
      <Link
        to="/shop/p/$productId"
        params={{ productId: product.id }}
        preload="intent"
        onPointerDown={prefetch}
        className="block"
      >
        <div
          className={cn("relative overflow-hidden bg-muted", compact ? "aspect-[4/3]" : "aspect-square")}
          onClick={() => onPhotoTap()}
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
        </div>
        <div className={cn("flex flex-1 flex-col", compact ? "p-2 pb-0" : "p-2.5 pb-0")}>
          <p className="line-clamp-2 text-[13px] font-bold leading-snug text-foreground">{product.name}</p>
          <p className="mt-1 text-[15px] font-extrabold tracking-tight text-primary">
            {product.sale_price != null ? formatPricePerUnit(Number(product.sale_price), product.unit, formatNgn) : "Ask seller"}
          </p>
          {formatServiceDates(product) && (
            <p className="mt-0.5 truncate text-[10px] font-semibold text-muted-foreground">
              {formatServiceDates(product)}
            </p>
          )}
        </div>
      </Link>
      <div className={cn("flex flex-1 flex-col", compact ? "px-2 pb-2" : "px-2.5 pb-2.5")}>
        <button
          type="button"
          className="mt-1 truncate text-left text-[11px] font-medium text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => {
            const slug = shopLinkSlug(product.business_slug, product.business_id);
            if (slug) void navigate({ to: "/b/$slug", params: { slug } });
          }}
        >
          {displayShopName(product.business_name)}
          {place ? ` · ${place}` : ""}
        </button>
        {product.sale_price != null ? (
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={adding}
              aria-label={`Add ${product.name} to cart`}
              className="inline-flex min-h-9 items-center justify-center gap-1 rounded-full border border-primary/30 bg-white px-2 text-[11px] font-extrabold text-primary"
              onClick={() => void quickAdd()}
            >
              <ShoppingCart className="size-3.5" />
              {adding ? t("shop.product.adding") : t("shop.feed.addToCart")}
            </button>
            <button
              type="button"
              className="min-h-9 rounded-full bg-primary px-2 text-[11px] font-extrabold text-white"
              onClick={() => {
                if (isMockFeedId(product.id)) {
                  toast.error("This listing is not available.");
                  return;
                }
                void navigate({ to: "/shop/buy", search: { productId: product.id } });
              }}
            >
              {t("shop.feed.buyNow")}
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}
