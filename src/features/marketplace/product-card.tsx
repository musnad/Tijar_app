"use client";

import { Link, useNavigate } from "@tanstack/react-router";
import { Plus, Store } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/features/auth/auth-context";
import { isMockFeedId } from "@/features/marketplace/feed-mock";
import { ProductSocialBar } from "@/features/marketplace/product-social";
import { ensureSavedProduct } from "@/lib/shop-social";
import { addToCart } from "@/services/marketplace-service";
import { formatNgn } from "@/utils/money";
import type { PublicProduct } from "@/types/database";
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
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_1px_2px_rgba(15,40,50,0.04)] will-change-transform transition-transform duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md",
        compact && "rounded-xl",
      )}
    >
      <Link to="/shop/p/$productId" params={{ productId: product.id }} className="flex flex-1 flex-col">
        <div className={cn("relative overflow-hidden bg-muted", compact ? "aspect-[4/3]" : "aspect-square")}>
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
          <button
            type="button"
            aria-label={`Add ${product.name} to cart`}
            className="absolute bottom-2 right-2 flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition hover:scale-105 active:scale-95"
            onClick={(e) => void quickAdd(e)}
          >
            <Plus className="size-4" strokeWidth={2.75} />
          </button>
        </div>
        <div className={cn("flex flex-1 flex-col", compact ? "p-2 pb-0" : "p-2.5 pb-0")}>
          <p className="line-clamp-2 text-[13px] font-bold leading-snug text-foreground">{product.name}</p>
          <p className="mt-1 text-[15px] font-extrabold tracking-tight text-primary">
            {product.sale_price != null ? formatNgn(Number(product.sale_price)) : "Ask seller"}
            {product.sale_price != null && product.unit && product.unit !== "piece" ? (
              <span className="ml-1 text-[10px] font-semibold text-muted-foreground">/{product.unit}</span>
            ) : null}
          </p>
          {formatServiceDates(product) && (
            <p className="mt-0.5 truncate text-[10px] font-semibold text-muted-foreground">
              {formatServiceDates(product)}
            </p>
          )}
          <span
            className="mt-1 flex min-w-0 items-center gap-1.5 underline-offset-2 hover:underline"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const slug = shopLinkSlug(product.business_slug, product.business_id);
              if (slug) void navigate({ to: "/b/$slug", params: { slug } });
            }}
          >
            {product.business_logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.business_logo_url}
                alt=""
                className="size-4 shrink-0 rounded-full object-cover ring-1 ring-border"
              />
            ) : (
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[8px] font-extrabold text-primary">
                {displayShopName(product.business_name).slice(0, 1)}
              </span>
            )}
            <span className="truncate text-[11px] font-medium text-muted-foreground">
              {displayShopName(product.business_name)}
            </span>
          </span>
        </div>
      </Link>
      <div className={cn("flex flex-col", compact ? "px-2 pb-2" : "px-2.5 pb-2.5")}>
        <ProductSocialBar product={product} compact className="-ml-1.5" />
        {product.sale_price != null ? (
          <button
            type="button"
            className="mt-1 min-h-9 w-full rounded-full bg-primary text-[11px] font-extrabold text-white"
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
    </div>
  );
}
