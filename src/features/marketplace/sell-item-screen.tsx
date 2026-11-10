"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Camera, ImagePlus, Loader2, Tag } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { SellerFeePreview } from "@/features/marketplace/seller-fee-preview";
import { useAuth } from "@/features/auth/auth-context";
import { usePrimaryBusiness } from "@/hooks/use-primary-business";
import {
  NIGERIA_STATE_NAMES,
  formatNigerianLocation,
  lgasForState,
  parseNigerianLocation,
} from "@/lib/nigeria-locations";
import { uploadProductImage } from "@/services/product-image-service";
import { createProduct, setProductPublished, updateProductImageUrl } from "@/services/product-service";
import { ensurePersonalShop } from "@/services/marketplace-service";
import { listBusinessCategories } from "@/services/business-service";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { normalizeMoneyRaw } from "@/features/products/schemas";

export function SellItemScreen() {
  const { profile, session } = useAuth();
  const businessQuery = usePrimaryBusiness(profile?.id);
  const business = businessQuery.data?.business ?? null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isFree, setIsFree] = useState(false);
  const [price, setPrice] = useState("");
  const [phone, setPhone] = useState("");
  const [stateName, setStateName] = useState("");
  const [lga, setLga] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  const categoriesQuery = useQuery({
    queryKey: ["business-categories"],
    queryFn: async () => (await listBusinessCategories()).data,
  });
  const categories = categoriesQuery.data ?? [];

  useEffect(() => {
    if (ready) return;
    if (businessQuery.isPending) return;
    const parsed = parseNigerianLocation(business?.location ?? null);
    if (parsed.state) {
      setStateName(parsed.state);
      if (parsed.lga) setLga(parsed.lga);
    }
    setPhone(business?.public_phone ?? profile?.phone ?? "");
    if (business?.category_id) setCategoryId(business.category_id);
    setReady(true);
  }, [ready, businessQuery.isPending, business, profile]);

  function pickFile(next: File | null) {
    if (!next) return;
    if (!next.type.startsWith("image/")) {
      toast.error("Use a photo (JPG, PNG, WEBP, or GIF).");
      return;
    }
    setFile(next);
    setPreview(URL.createObjectURL(next));
  }

  async function submit() {
    if (!session || !profile) {
      toast.error("Sign in first to post your item.");
      return;
    }
    if (!file) return toast.error("Add a photo. You cannot post without an image.");
    if (!name.trim()) return toast.error("Give your item a name");
    if (!isFree && !normalizeMoneyRaw(price)) return toast.error("Enter a price, or mark it as Free");
    if (!phone.trim()) return toast.error("Add a phone number so buyers can call you");
    if (!stateName) return toast.error("Select your state");
    if (!lga) return toast.error("Select your local government area");
    if (!categoryId) return toast.error("Choose a category for your shop");

    setBusy(true);
    const location = formatNigerianLocation(stateName, lga);

    let businessId = business?.id ?? null;
    if (!businessId) {
      const shop = await ensurePersonalShop({
        profileId: profile.id,
        displayName: `${profile.full_name || "My"} items`,
        location,
        phone,
        categoryId,
      });
      if (shop.error || !shop.businessId) {
        setBusy(false);
        toast.error(shop.error ?? "Could not open your selling profile.");
        return;
      }
      businessId = shop.businessId;
    }

    const priceValue = isFree ? 0 : Number(normalizeMoneyRaw(price) ?? 0);
    const created = await createProduct(businessId, profile.id, {
      name: name.trim(),
      kind: "goods",
      unit: "piece",
      salePrice: priceValue,
      isPublished: false,
      ...(description.trim() ? { description: description.trim(), notes: description.trim() } : {}),
    });
    if (created.error || !created.product) {
      setBusy(false);
      toast.error(created.error ?? "Could not post your item.");
      return;
    }

    const uploaded = await uploadProductImage(businessId, created.product.id, file, 0);
    if (uploaded.error || !uploaded.publicUrl) {
      setBusy(false);
      toast.error(uploaded.error ?? "Add a photo. You cannot post without an image.");
      return;
    }
    await updateProductImageUrl(created.product.id, uploaded.publicUrl);
    const live = await setProductPublished(created.product.id, true);
    if (live.error) {
      setBusy(false);
      toast.error(live.error);
      return;
    }

    // Make sure the shop profile is public and carries a callable number.
    const supabase = getSupabaseBrowserClient();
    await supabase
      .from("businesses")
      .update({
        public_phone: phone.trim(),
        public_whatsapp: phone.trim(),
        location,
        category_id: categoryId,
      })
      .eq("id", businessId);
    await supabase.rpc("ensure_marketplace_listing", { p_business_id: businessId });

    setBusy(false);
    void queryClient.invalidateQueries({ queryKey: ["marketplace-shops"] });
    void queryClient.invalidateQueries({ queryKey: ["local-businesses"] });
    void queryClient.invalidateQueries({ queryKey: ["marketplace-products"] });
    toast.success(isFree ? "Posted — your free item is live" : "Posted — your item is live");
    void navigate({ to: "/shop/p/$productId", params: { productId: created.product.id } });
  }

  if (!session || !profile) {
    return (
      <SellShell>
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <p className="font-bold">Sign in to sell an item</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Anyone can sell a second-hand item — no business account needed.
          </p>
          <Button className="mt-4 rounded-xl font-bold" asChild>
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
      </SellShell>
    );
  }

  return (
    <SellShell>
      <Link
        to="/shop/create"
        className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground"
      >
        <ArrowLeft className="size-4" /> Sell
      </Link>

      <section className="dashboard-summary-card rounded-2xl p-5 text-primary-foreground shadow-lg">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-white/70">
          <Tag className="size-3.5" /> Second-hand marketplace
        </p>
        <h1 className="mt-1.5 text-xl font-extrabold">Sell an item from your house</h1>
        <p className="mt-1 text-sm text-white/85">
          Post anything you want to sell — free or paid. Buyers nearby see it and can call you.
          {business ? ` Posting as ${business.business_name}.` : " A simple seller profile will be created for you."}
        </p>
      </section>

      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-extrabold">Item photo (required)</h2>
          <div className="relative mt-3 flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-muted/40">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="size-full object-cover" />
            ) : (
              <span className="flex flex-col items-center gap-2 text-muted-foreground">
                <Camera className="size-8" />
                <span className="text-sm font-semibold">Add a clear photo</span>
              </span>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button type="button" className="min-h-11 rounded-xl font-bold" onClick={() => cameraRef.current?.click()}>
              <Camera className="mr-1.5 size-4" /> Snap
            </Button>
            <Button type="button" variant="outline" className="min-h-11 rounded-xl font-bold" onClick={() => libraryRef.current?.click()}>
              <ImagePlus className="mr-1.5 size-4" /> Gallery
            </Button>
          </div>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              pickFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          <input
            ref={libraryRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              pickFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </section>

        <section className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-extrabold">Item details</h2>
          <div>
            <label className="text-xs font-semibold text-muted-foreground" htmlFor="item-name">
              What are you selling? *
            </label>
            <Input
              id="item-name"
              className="mt-1 min-h-11 rounded-xl text-base"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Samsung 32-inch TV"
              required
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground" htmlFor="item-desc">
              Describe it (optional)
            </label>
            <textarea
              id="item-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-base"
              placeholder="Condition, age, any faults…"
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-3 py-2.5">
            <div>
              <p className="text-sm font-bold">Give it away for free</p>
              <p className="text-[11px] text-muted-foreground">Turn this on if you are not selling for money.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isFree}
              onClick={() => setIsFree((v) => !v)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${isFree ? "bg-primary" : "bg-muted-foreground/40"}`}
            >
              <span
                className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${isFree ? "left-[22px]" : "left-0.5"}`}
              />
            </button>
          </div>

          {!isFree && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground" htmlFor="item-price">
                Price (₦) *
              </label>
              <Input
                id="item-price"
                className="mt-1 min-h-11 rounded-xl text-base"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="e.g. 15000"
                inputMode="decimal"
                required
              />
              <SellerFeePreview price={Number(normalizeMoneyRaw(price) ?? 0)} />
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-extrabold">Your area & contact</h2>
          <div>
            <label className="text-xs font-semibold text-muted-foreground" htmlFor="item-category">
              Shop category *
            </label>
            <select
              id="item-category"
              className="mt-1 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
            >
              <option value="">{categoriesQuery.isLoading ? "Loading categories…" : "Select category"}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Helps buyers find your shop when they search by category.
            </p>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground" htmlFor="item-phone">
              Phone (buyers will call this) *
            </label>
            <Input
              id="item-phone"
              className="mt-1 min-h-11 rounded-xl text-base"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="080…"
              inputMode="tel"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base"
              value={stateName}
              onChange={(e) => {
                setStateName(e.target.value);
                setLga("");
              }}
              aria-label="State"
              required
            >
              <option value="">State *</option>
              {NIGERIA_STATE_NAMES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base disabled:opacity-60"
              value={lga}
              onChange={(e) => setLga(e.target.value)}
              aria-label="Local government area"
              disabled={!stateName}
              required
            >
              <option value="">{stateName ? "Local government *" : "Pick a state first"}</option>
              {lgasForState(stateName).map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Buyers in this area find your item first and can call you directly.
          </p>
        </section>

        <Button type="submit" className="min-h-12 w-full rounded-xl font-bold" disabled={busy}>
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          {busy ? "Posting…" : isFree ? "Post free item" : "Post item for sale"}
        </Button>
      </form>
    </SellShell>
  );
}

function SellShell({ children }: { children: React.ReactNode }) {
  return (
    <MarketplaceShell hideTopBar variant="feed">
      <div
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain bg-white px-4 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))] in-[.native-shop]:bg-[var(--native-canvas,#F3F5F8)] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {children}
      </div>
    </MarketplaceShell>
  );
}
