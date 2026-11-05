"use client";

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { useAuth } from "@/features/auth/auth-context";
import { usePrimaryBusiness } from "@/hooks/use-primary-business";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { publishBusinessStory } from "@/services/story-service";

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
  const [saving, setSaving] = useState(false);

  const productsQuery = useQuery({
    queryKey: ["story-products", business?.id],
    enabled: Boolean(business?.id),
    queryFn: async () => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sale_price")
        .eq("business_id", business!.id)
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(40);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

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
      toast.error("Pick a photo or short video.");
      return;
    }
    setSaving(true);
    const priceNum = price.trim() ? Number(price.replace(/[^\d.]/g, "")) : null;
    const { error } = await publishBusinessStory({
      businessId: business.id,
      profileId: profile.id,
      file,
      overlayText: overlay,
      price: Number.isFinite(priceNum) ? priceNum : null,
      productId: productId || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Story is live for 24 hours.");
    void navigate({ to: "/shop" });
  }

  return (
    <MarketplaceShell hideTopBar variant="feed">
      <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col bg-[#0A2540] text-white">
        <header className="flex items-center justify-between px-4 pt-[max(0.8rem,env(safe-area-inset-top))]">
          <button type="button" className="min-h-11 font-bold" onClick={() => history.back()}>
            Cancel
          </button>
          <p className="text-sm font-extrabold">New story</p>
          <span className="w-12" />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-4">
          <label className="flex aspect-[9/16] w-full cursor-pointer items-center justify-center overflow-hidden rounded-3xl bg-black/40">
            {preview ? (
              file?.type.startsWith("video/") ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video src={preview} className="h-full w-full object-cover" controls />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" className="h-full w-full object-cover" />
              )
            ) : (
              <span className="px-6 text-center text-sm font-semibold text-white/80">
                Tap to add a photo or a short video. It expires in 24 hours.
              </span>
            )}
            <input
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <label className="mt-4 block text-xs font-bold text-white/70">Text overlay</label>
          <Input
            className="mt-1 min-h-12 border-0 bg-white/10 text-white placeholder:text-white/40"
            value={overlay}
            onChange={(e) => setOverlay(e.target.value)}
            placeholder="Fresh pepper, ₦500"
            maxLength={80}
          />
          <label className="mt-3 block text-xs font-bold text-white/70">Price (optional)</label>
          <Input
            className="mt-1 min-h-12 border-0 bg-white/10 text-white placeholder:text-white/40"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="5000"
            inputMode="decimal"
          />
          <label className="mt-3 block text-xs font-bold text-white/70">Link a product (optional)</label>
          <select
            className="mt-1 min-h-12 w-full rounded-xl border-0 bg-white/10 px-3 text-sm text-white"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="" className="text-foreground">
              No product
            </option>
            {(productsQuery.data ?? []).map((p) => (
              <option key={p.id as string} value={p.id as string} className="text-foreground">
                {p.name as string}
              </option>
            ))}
          </select>
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
