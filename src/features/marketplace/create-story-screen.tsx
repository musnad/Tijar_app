"use client";

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CommerceSticker } from "@/features/marketplace/commerce-sticker";
import { VerifyToPostCard } from "@/features/business/verify-to-post";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { useAuth } from "@/features/auth/auth-context";
import { usePrimaryBusiness } from "@/hooks/use-primary-business";
import { shopQueryAllowsPost } from "@/lib/kyc/kyc-runtime";
import { cn } from "@/lib/utils";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { publishBusinessStory } from "@/services/story-service";
import { formatNgn } from "@/utils/money";

export function CreateStoryScreen() {
  const { profile, session } = useAuth();
  const shop = usePrimaryBusiness(profile?.id);
  const navigate = useNavigate();
  const business = shop.data?.business;
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [overlay, setOverlay] = useState("");
  const [price, setPrice] = useState("");
  const [productId, setProductId] = useState("");
  const [offerKind, setOfferKind] = useState<"product" | "place_order">("product");
  const [saving, setSaving] = useState(false);

  const productsQuery = useQuery({
    queryKey: ["story-products", business?.id],
    enabled: Boolean(business?.id),
    queryFn: async () => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sale_price, image_url")
        .eq("business_id", business!.id)
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(40);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const product = useMemo(
    () => (productsQuery.data ?? []).find((p) => p.id === productId) ?? null,
    [productsQuery.data, productId],
  );
  const priceNum = price.trim() ? Number(price.replace(/[^\d.]/g, "")) : null;
  const stickerPrice =
    Number.isFinite(priceNum) && priceNum != null
      ? priceNum
      : product?.sale_price != null
        ? Number(product.sale_price)
        : null;
  const stickerTitle = overlay.trim() || (product?.name as string | undefined) || business?.business_name || "TIJAR";
  const ctaLabel = offerKind === "place_order" ? "Place your order" : "Buy now";

  function onFile(next: File | null) {
    setFile(next);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(next ? URL.createObjectURL(next) : null);
  }

  async function publish() {
    if (!session || !profile) {
      toast.message("Sign in to post a story.");
      return;
    }
    if (!business) {
      toast.error("Create your shop first.");
      return;
    }
    if (!file) {
      toast.error("Add a photo. You cannot post without an image.");
      return;
    }
    const name = overlay.trim() || (product?.name as string | undefined) || "";
    if (!name) {
      toast.error("Add a name so shoppers can order this.");
      return;
    }
    if (stickerPrice == null || stickerPrice <= 0) {
      toast.error("Add a price so shoppers can order this.");
      return;
    }
    setSaving(true);
    const { error } = await publishBusinessStory({
      businessId: business.id,
      profileId: profile.id,
      file,
      overlayText: name,
      price: stickerPrice,
      productId: productId || null,
      offerKind,
    });
    setSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(
      offerKind === "place_order"
        ? "Story is live. Shoppers can place an order from it."
        : "Story is live. Shoppers can buy it from the sticker.",
    );
    void navigate({ to: "/shop" });
  }

  if (business && !shopQueryAllowsPost(shop.data)) {
    return (
      <MarketplaceShell hideTopBar variant="feed">
        <VerifyToPostCard />
      </MarketplaceShell>
    );
  }

  return (
    <MarketplaceShell hideTopBar variant="feed">
      <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col bg-[#3B0A5C] text-white">
        <header className="flex items-center justify-between px-4 pt-[max(0.8rem,env(safe-area-inset-top))]">
          <button type="button" className="min-h-11 font-bold" onClick={() => history.back()}>
            Cancel
          </button>
          <p className="text-sm font-extrabold">New story</p>
          <span className="w-12" />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-3">
          <label className="relative flex aspect-[9/16] w-full cursor-pointer items-center justify-center overflow-hidden rounded-3xl bg-black/35">
            {preview ? (
              file?.type.startsWith("video/") ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video src={preview} className="h-full w-full object-cover" muted playsInline />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" className="h-full w-full object-cover" />
              )
            ) : (
              <span className="px-6 text-center text-sm font-semibold text-white/80">
                Tap to add a photo or a short video. This also becomes a product shoppers can order.
              </span>
            )}
            {preview ? (
              <div className="pointer-events-none absolute bottom-3 left-3">
                <CommerceSticker
                  title={stickerTitle}
                  imageUrl={(product?.image_url as string | null) ?? business?.logo_url ?? null}
                  price={stickerPrice}
                  ctaLabel={ctaLabel}
                />
              </div>
            ) : null}
            <input
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
          </label>

          <p className="mt-4 text-[12px] font-bold uppercase tracking-wide text-white/60">How shoppers order</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              className={cn(
                "min-h-11 rounded-full text-[13px] font-extrabold",
                offerKind === "product" ? "bg-[#00B86B] text-white" : "bg-white/10 text-white/80",
              )}
              onClick={() => setOfferKind("product")}
            >
              Buy now
            </button>
            <button
              type="button"
              className={cn(
                "min-h-11 rounded-full text-[13px] font-extrabold",
                offerKind === "place_order" ? "bg-[#00B86B] text-white" : "bg-white/10 text-white/80",
              )}
              onClick={() => setOfferKind("place_order")}
            >
              Place your order
            </button>
          </div>

          <p className="mt-4 text-[12px] font-bold uppercase tracking-wide text-white/60">Name and price on the sticker</p>
          <Input
            className="mt-2 min-h-12 border-0 bg-white/10 text-white placeholder:text-white/40"
            value={overlay}
            onChange={(e) => setOverlay(e.target.value)}
            placeholder="Fresh pepper"
            maxLength={80}
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Input
              className="min-h-12 border-0 bg-white/10 text-white placeholder:text-white/40"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={product?.sale_price != null ? String(product.sale_price) : "Price ₦"}
              inputMode="decimal"
            />
            <select
              className="min-h-12 w-full rounded-xl border-0 bg-white/10 px-3 text-sm text-white"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              <option value="" className="text-foreground">
                New product from this story
              </option>
              {(productsQuery.data ?? []).map((p) => (
                <option key={p.id as string} value={p.id as string} className="text-foreground">
                  {p.name as string}
                  {p.sale_price != null ? ` · ${formatNgn(Number(p.sale_price))}` : ""}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            className="mt-5 min-h-12 w-full rounded-full bg-[#00B86B] font-extrabold text-white hover:bg-[#00B86B]/90"
            disabled={saving}
            onClick={() => void publish()}
          >
            {saving ? "Posting…" : "Share story"}
          </Button>
        </div>
      </div>
    </MarketplaceShell>
  );
}
