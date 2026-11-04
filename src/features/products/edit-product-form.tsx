"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppPageHeader } from "@/features/app-layout/app-page-header";
import { ProductPhotosField, type ProductPhotoItem } from "@/features/products/product-photos-field";
import { ProductCard } from "@/features/marketplace/product-card";
import { canPublishProduct, productPublishErrors } from "@/lib/catalogue/publish-guard";
import { parseAttributes, variantsFromSizeColour } from "@/lib/catalogue/variants";
import { invalidateBusinessQueries } from "@/lib/invalidate-business-queries";
import { uploadProductImage } from "@/services/product-image-service";
import { deactivateProduct, getProduct, restoreProduct, updateProduct, updateProductImages } from "@/services/product-service";
import type { PublicProduct } from "@/types/database";
import { formatNgn } from "@/utils/money";

export function EditProductForm({ businessId, productId }: { businessId: string; productId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["edit-product", productId],
    queryFn: async () => {
      const r = await getProduct(productId);
      if (r.error) throw new Error(r.error);
      if (!r.product || r.product.business_id !== businessId) throw new Error("This product is not in your catalogue.");
      return r.product;
    },
  });

  const product = query.data;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [sizes, setSizes] = useState("");
  const [colours, setColours] = useState("");
  const [photos, setPhotos] = useState<ProductPhotoItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [serviceType, setServiceType] = useState<"general" | "course" | "mentorship">("general");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [condition, setCondition] = useState<"new" | "used">("new");

  useEffect(() => {
    if (!product) return;
    setName(product.name);
    setDescription(product.description || product.notes || "");
    setSalePrice(product.sale_price != null ? String(product.sale_price) : "");
    setCondition(product.attributes?.["condition"] === "used" ? "used" : "new");
    setServiceType(product.service_type === "course" || product.service_type === "mentorship" ? product.service_type : "general");
    setStartsOn(product.starts_on ? String(product.starts_on).slice(0, 10) : "");
    setEndsOn(product.ends_on ? String(product.ends_on).slice(0, 10) : "");
    const extras = product.extra_image_urls ?? [];
    const urls = [product.image_url, ...extras].filter((u): u is string => Boolean(u));
    setPhotos([...new Set(urls)].map((url) => ({ url })));
  }, [product]);

  const priceNum = salePrice.trim() ? Number(salePrice) : null;
  const publishErrors = product
    ? productPublishErrors({
        name,
        sale_price: Number.isFinite(priceNum as number) ? priceNum : null,
        image_url: photos[0]?.url ?? product.image_url,
        is_active: product.is_active,
      })
    : [];

  async function save(publish?: boolean) {
    if (!product) return;
    if (photos.length === 0) {
      toast.error("Add at least one product photo.");
      return;
    }
    if (!Number.isFinite(priceNum as number)) {
      toast.error("Add a price for this product.");
      return;
    }
    if (publish && !canPublishProduct({
      name,
      sale_price: Number.isFinite(priceNum as number) ? priceNum : null,
      image_url: photos[0]?.url ?? product.image_url,
      is_active: product.is_active,
    })) {
      toast.error(publishErrors[0] ?? "Fix validation errors before publishing.");
      return;
    }
    setBusy(true);
    const urls: string[] = [];
    for (const [i, photo] of photos.entries()) {
      if (photo.file) {
        const uploaded = await uploadProductImage(businessId, product.id, photo.file, i);
        if (uploaded.publicUrl) urls.push(uploaded.publicUrl);
      } else if (photo.url) {
        urls.push(photo.url);
      }
    }
    if (urls.length > 0 || photos.length === 0) {
      await updateProductImages(product.id, urls);
    }
    const imageUrl = urls[0] ?? null;
    const attrs = {
      ...parseAttributes(undefined, undefined),
      ...(condition ? { condition } : {}),
    };
    const { error } = await updateProduct(product.id, {
      name: name.trim(),
      description: description.trim() || null,
      notes: description.trim() || null,
      sale_price: Number.isFinite(priceNum as number) ? priceNum : null,
      variants: variantsFromSizeColour(sizes, colours),
      attributes: attrs,
      image_url: imageUrl,
      extra_image_urls: urls.slice(1),
      is_published: publish ? true : (product.is_published ?? false),
      service_type: product.kind === "service" ? serviceType : "general",
      starts_on: product.kind === "service" && startsOn ? startsOn : null,
      ends_on: product.kind === "service" && endsOn ? endsOn : null,
    });
    setBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    await invalidateBusinessQueries(queryClient, businessId);
    toast.success(publish ? "Published to the marketplace" : "Saved");
    void navigate({ to: "/app/products" });
  }

  if (query.isLoading) return <p className="mt-8 text-muted-foreground">…</p>;
  if (!product) return <p className="mt-8 text-sm text-destructive">Product not found for this business.</p>;

  const preview: PublicProduct = {
    id: product.id,
    business_id: product.business_id,
    name,
    kind: product.kind,
    description,
    sale_price: Number.isFinite(priceNum as number) ? Number(priceNum) : null,
    unit: product.unit,
    image_url: photos[0]?.url ?? product.image_url,
    is_available: product.kind === "service" || Number(product.stock_quantity) > 0,
    business_name: "Your shop",
  };

  return (
    <>
      <AppPageHeader title="Edit product" subtitle="Only members of this shop can save. Preview uses live fields." />
      <div className="mt-4 space-y-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="min-h-11 rounded-xl" />
        <textarea className="min-h-24 w-full rounded-xl border px-3 py-2" value={description} onChange={(e) => setDescription(e.target.value)} />
        <Input value={salePrice} onChange={(e) => setSalePrice(e.target.value)} placeholder="Sale price (NGN) *" className="min-h-11 rounded-xl" inputMode="decimal" />
        {product.kind !== "service" && (
          <div className="grid grid-cols-2 gap-1">
            {([["new", "New"], ["used", "Second hand"]] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setCondition(value)}
                className={`rounded-lg py-2 text-[11px] font-bold ${
                  condition === value ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {product.kind === "service" && (
          <>
            <div className="grid grid-cols-3 gap-1">
              {(["general", "course", "mentorship"] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setServiceType(st)}
                  className={`rounded-lg py-2 text-[10px] font-bold capitalize ${
                    serviceType === st ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}
                >
                  {st === "general" ? "Other" : st}
                </button>
              ))}
            </div>
            {(serviceType === "course" || serviceType === "mentorship") && (
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  Starts
                  <Input type="date" className="mt-1 min-h-11 rounded-xl" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
                </label>
                <label className="text-xs font-semibold text-muted-foreground">
                  Finishes
                  <Input type="date" className="mt-1 min-h-11 rounded-xl" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
                </label>
              </div>
            )}
          </>
        )}
        <Input value={sizes} onChange={(e) => setSizes(e.target.value)} placeholder="Sizes (S, M, L)" className="min-h-11 rounded-xl" />
        <Input value={colours} onChange={(e) => setColours(e.target.value)} placeholder="Colours" className="min-h-11 rounded-xl" />
        <ProductPhotosField photos={photos} onChange={setPhotos} />
      </div>
      {publishErrors.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-primary">
          {publishErrors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="mt-5">
        <p className="mb-2 text-sm font-bold">Customer card preview</p>
        <div className="max-w-xs pointer-events-none">
          <ProductCard product={preview} />
        </div>
        {preview.sale_price != null && <p className="mt-1 text-xs text-muted-foreground">{formatNgn(preview.sale_price)}</p>}
      </div>
      <div className="mt-5 flex flex-col gap-2">
        <Button className="rounded-xl" disabled={busy} onClick={() => void save(false)}>
          Save
        </Button>
        <Button className="rounded-xl" disabled={busy} onClick={() => void save(true)}>
          Publish to marketplace
        </Button>
        {product.is_active !== false ? (
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={async () => {
              const r = await deactivateProduct(product.id);
              if (r.error) toast.error(r.error);
              else {
                toast.success("Archived");
                await invalidateBusinessQueries(queryClient, businessId);
                void navigate({ to: "/app/products" });
              }
            }}
          >
            Archive
          </Button>
        ) : (
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={async () => {
              const r = await restoreProduct(product.id);
              if (r.error) toast.error(r.error);
              else toast.success("Restored");
            }}
          >
            Restore
          </Button>
        )}
        <Link to="/app/products" className="text-center text-sm font-semibold text-primary">
          Back to catalogue
        </Link>
      </div>
    </>
  );
}
