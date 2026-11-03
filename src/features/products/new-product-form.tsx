"use client";

import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Mic, Square } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormSection } from "@/features/app-layout/form-section";
import { ProductPhotosField, type ProductPhotoItem } from "@/features/products/product-photos-field";
import {
  normalizeMoneyRaw,
  normalizeQtyRaw,
  productFormSchema,
} from "@/features/products/schemas";
import { speakText, useSpeechRecognition } from "@/features/translate/use-speech";
import { invalidateBusinessQueries } from "@/lib/invalidate-business-queries";
import { useTranslation } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { uploadProductImage } from "@/services/product-image-service";
import { createProduct, updateProductImages } from "@/services/product-service";
import type { ProductKind } from "@/types/database";
import { saleLineTotals } from "@/utils/product-profit";
import { formatNgn } from "@/utils/money";
import { canPublishProduct, productPublishErrors, productPublishWarnings } from "@/lib/catalogue/publish-guard";
import { parseVoiceProduct } from "@/utils/voice-product";

const goodsUnits = ["piece", "bag", "carton", "kg", "litre"] as const;

type FieldErrors = Partial<
  Record<"name" | "salePrice" | "costPrice" | "initialStock" | "lowStockThreshold", string>
>;

/** Keep optional numbers soft: bad input is dropped so name-only save still works. */
function softMoney(raw: string): string | undefined {
  const n = normalizeMoneyRaw(raw);
  if (n === undefined) return undefined;
  if (!/^\d+(\.\d{1,2})?$/.test(n)) return undefined;
  return n;
}

function softQty(raw: string): string | undefined {
  const n = normalizeQtyRaw(raw);
  if (n === undefined) return undefined;
  if (!/^\d+(\.\d{1,3})?$/.test(n)) return undefined;
  return n;
}

export function NewProductForm({
  businessId,
  profileId,
}: {
  businessId: string;
  profileId: string;
}) {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<ProductKind>("goods");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<(typeof goodsUnits)[number]>("piece");
  const [salePrice, setSalePrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [initialStock, setInitialStock] = useState("1");
  const [lowThreshold, setLowThreshold] = useState("5");
  const [notes, setNotes] = useState("");
  const [description, setDescription] = useState("");
  const [catalogueCategory, setCatalogueCategory] = useState("");
  const [colour, setColour] = useState("");
  const [size, setSize] = useState("");
  const [sizes, setSizes] = useState("");
  const [colours, setColours] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [serviceType, setServiceType] = useState<"general" | "course" | "mentorship">("general");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [photos, setPhotos] = useState<ProductPhotoItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  const { listen, stop, listening, supported } = useSpeechRecognition();

  const speakLang =
    locale === "yo" ? "Yoruba" : locale === "sw" ? "Swahili" : locale === "ha" ? "Hausa" : "English";

  const saleNum = Number.parseFloat(softMoney(salePrice) ?? "");
  const costNum = Number.parseFloat(softMoney(costPrice) ?? "");
  const previewProfit =
    Number.isFinite(saleNum) && saleNum > 0
      ? saleLineTotals(saleNum, Number.isFinite(costNum) ? costNum : 0, 1).profit
      : null;

  const publishErrors = productPublishErrors({
    name,
    sale_price: Number.isFinite(saleNum) ? saleNum : salePrice.trim() ? null : null,
    image_url: photos[0] ? "pending" : null,
    is_active: true,
  });
  const publishWarnings = productPublishWarnings({
    name,
    sale_price: Number.isFinite(saleNum) ? saleNum : null,
    image_url: photos[0] ? "pending" : null,
    is_active: true,
  });

  async function onVoice() {
    setVoiceHint(null);
    try {
      const transcript = await listen(speakLang);
      if (!transcript.trim()) return;
      const draft = parseVoiceProduct(transcript);
      if (!draft.name) {
        toast.message(t("app.products.voiceNeedName"));
        setVoiceHint(transcript);
        return;
      }
      setName(draft.name);
      setKind(draft.kind);
      if (draft.kind === "goods" && goodsUnits.includes(draft.unit as (typeof goodsUnits)[number])) {
        setUnit(draft.unit as (typeof goodsUnits)[number]);
      }
      if (draft.salePrice) setSalePrice(draft.salePrice);
      if (draft.costPrice) setCostPrice(draft.costPrice);
      if (draft.initialStock) setInitialStock(draft.initialStock);
      setFieldErrors({});
      setFormError(null);
      setVoiceHint(transcript);
      toast.success(t("app.products.voiceFilled"));
      void speakText(t("app.products.voiceFilledSpeak"), speakLang);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("app.products.voiceFailed"));
    }
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setFieldErrors({});
    setFormError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setFieldErrors({ name: t("app.products.nameRequired") });
      setFormError(t("app.products.nameRequired"));
      toast.error(t("app.products.nameRequired"));
      return;
    }

    if (photos.length === 0) {
      const msg = "Add at least one product photo.";
      setFormError(msg);
      toast.error(msg);
      return;
    }

    // Soft-clean optional fields so a typo in price never blocks saving the product.
    const cleanedSale = softMoney(salePrice);
    const cleanedCost = softMoney(costPrice);
    const cleanedStock = kind === "goods" ? softQty(initialStock) : undefined;
    const cleanedLow = kind === "goods" ? softQty(lowThreshold) ?? "5" : undefined;

    if (salePrice.trim() && !cleanedSale) {
      toast.message(t("app.products.ignoredBadPrice"));
    }
    if (costPrice.trim() && !cleanedCost) {
      toast.message(t("app.products.ignoredBadPrice"));
    }
    if (kind === "goods" && initialStock.trim() && !cleanedStock) {
      toast.message(t("app.products.ignoredBadStock"));
    }

    let publishNow = isPublished;
    if (publishNow && !canPublishProduct({
      name: trimmedName,
      sale_price: cleanedSale != null ? Number(cleanedSale) : null,
      image_url: photos[0] ? "pending" : null,
      is_active: true,
    })) {
      toast.error(publishErrors[0] ?? "Fix catalogue errors before publishing.");
      publishNow = false;
      setIsPublished(false);
    }

    const parsed = productFormSchema.safeParse({
      name: trimmedName,
      kind,
      unit: kind === "service" ? "job" : unit,
      salePrice: cleanedSale,
      costPrice: cleanedCost,
      initialStock: cleanedStock,
      lowStockThreshold: cleanedLow,
      notes: notes.trim() || undefined,
      description: description.trim() || undefined,
      catalogueCategory: catalogueCategory.trim() || undefined,
      colour: colour.trim() || undefined,
      size: size.trim() || undefined,
      sizes: sizes.trim() || undefined,
      colours: colours.trim() || undefined,
      videoUrl: videoUrl.trim() || undefined,
      isPublished: publishNow,
      serviceType: kind === "service" ? serviceType : "general",
      startsOn: kind === "service" ? startsOn || undefined : undefined,
      endsOn: kind === "service" ? endsOn || undefined : undefined,
    });

    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (
          key === "name" ||
          key === "salePrice" ||
          key === "costPrice" ||
          key === "initialStock" ||
          key === "lowStockThreshold"
        ) {
          if (!next[key]) next[key] = issue.message;
        }
      }
      setFieldErrors(next);
      const msg = parsed.error.issues[0]?.message ?? t("app.errors.validation");
      setFormError(msg);
      toast.error(msg);
      return;
    }

    setSaving(true);
    try {
      const { product, error } = await createProduct(businessId, profileId, parsed.data);
      if (error && !product) {
        setFormError(error);
        toast.error(error);
        return;
      }
      if (error && product) {
        toast.message(error);
      }

      if (product && photos.length > 0) {
        try {
          const urls: string[] = [];
          for (const [i, photo] of photos.entries()) {
            if (!photo.file) continue;
            const uploaded = await uploadProductImage(businessId, product.id, photo.file, i);
            if (uploaded.publicUrl) urls.push(uploaded.publicUrl);
            else if (uploaded.error) toast.message(uploaded.error);
          }
          if (urls.length > 0) await updateProductImages(product.id, urls);
        } catch {
          toast.message(t("app.products.photoHint"));
        }
      }

      if (!product) {
        const msg = error || t("app.errors.saveFailed");
        setFormError(msg);
        toast.error(msg);
        return;
      }

      toast.success(parsed.data.isPublished ? "Saved. Customers can see this in your shop." : t("app.products.saved"), {
        description: product.name,
        icon: <CheckCircle2 className="size-4" />,
      });
      await invalidateBusinessQueries(queryClient, businessId);
      void navigate({ to: "/app/products" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("app.errors.saveFailed");
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="mt-5 space-y-4 pb-8" onSubmit={(e) => void submit(e)}>
      {/* Voice add */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <p className="text-sm font-bold">{t("app.products.voiceTitle")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("app.products.voiceHint")}</p>
        <div className="mt-3 flex gap-2">
          {supported &&
            (listening ? (
              <Button
                type="button"
                variant="destructive"
                className="min-h-12 flex-1 rounded-xl font-bold"
                onClick={stop}
              >
                <Square className="mr-1.5 size-4" /> {t("app.products.voiceStop")}
              </Button>
            ) : (
              <Button
                type="button"
                className="min-h-12 flex-1 rounded-xl bg-teal-700 font-bold hover:bg-teal-800"
                onClick={() => void onVoice()}
              >
                <Mic className="mr-1.5 size-4" /> {t("app.products.voiceAdd")}
              </Button>
            ))}
        </div>
        {voiceHint && (
          <p className="mt-2 rounded-xl bg-muted/70 px-3 py-2 text-xs text-muted-foreground">
            “{voiceHint}”
          </p>
        )}
      </div>

      <div className="dashboard-summary-card rounded-2xl p-4 text-primary-foreground shadow-lg sm:p-5">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setKind("goods")}
            className={cn(
              "flex-1 rounded-xl py-2.5 text-xs font-bold",
              kind === "goods" ? "bg-white/20 ring-2 ring-white/50" : "bg-white/10",
            )}
          >
            {t("app.products.kindGoods")}
          </button>
          <button
            type="button"
            onClick={() => setKind("service")}
            className={cn(
              "flex-1 rounded-xl py-2.5 text-xs font-bold",
              kind === "service" ? "bg-white/20 ring-2 ring-white/50" : "bg-white/10",
            )}
          >
            {t("app.products.kindService")}
          </button>
        </div>
        {kind === "service" && (
          <div className="mt-3 grid grid-cols-3 gap-1">
            {(["general", "course", "mentorship"] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setServiceType(st)}
                className={cn(
                  "rounded-lg py-2 text-[10px] font-bold capitalize",
                  serviceType === st ? "bg-white/25 ring-2 ring-white/50" : "bg-white/10",
                )}
              >
                {st === "general" ? "Other service" : st}
              </button>
            ))}
          </div>
        )}

        <label className="mt-4 block">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-white/80">
            {t("app.products.nameSection")} *
          </span>
          <Input
            className={cn(
              "min-h-12 border-0 bg-white text-base font-bold text-foreground placeholder:text-muted-foreground",
              fieldErrors.name && "ring-2 ring-red-400",
            )}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (fieldErrors.name) setFieldErrors((f) => ({ ...f, name: undefined }));
              if (formError) setFormError(null);
            }}
            placeholder={t("app.products.namePlaceholder")}
            autoComplete="off"
            autoFocus
            name="productName"
            required
          />
          {fieldErrors.name && (
            <p className="mt-1 text-xs font-semibold text-red-100">{fieldErrors.name}</p>
          )}
          <p className="mt-1.5 text-xs text-white/75">{t("app.products.nameHint")}</p>
        </label>
      </div>

      <FormSection
        title={kind === "service" ? t("app.products.serviceCostSection") : t("app.products.pricingSection")}
        hint={
          kind === "service" ? t("app.products.serviceCostHint") : t("app.products.pricingHintFull")
        }
      >
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">
            {kind === "service" ? t("app.products.serviceCostPlaceholder") : t("app.products.costPricePlaceholder")}
          </span>
          <Input
            className="min-h-12 rounded-xl bg-background"
            inputMode="decimal"
            value={costPrice}
            onChange={(e) => setCostPrice(e.target.value)}
            placeholder="e.g. 12000 or 12k"
            name="costPrice"
          />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">
            {t("app.products.salePricePlaceholder")}
          </span>
          <Input
            className="min-h-12 rounded-xl bg-background"
            inputMode="decimal"
            value={salePrice}
            onChange={(e) => setSalePrice(e.target.value)}
            placeholder="e.g. 15000 or ₦15,000"
            name="salePrice"
          />
        </label>
        <p className="mt-2 text-xs text-muted-foreground">{t("app.products.priceFormatHint")}</p>
        {previewProfit !== null && Number.isFinite(previewProfit) && (
          <p
            className={cn(
              "mt-2 text-xs font-semibold",
              previewProfit >= 0 ? "text-primary" : "text-red-700",
            )}
          >
            {previewProfit >= 0 ? t("app.products.profitPerUnit") : t("app.products.lossPerUnit")}:{" "}
            {formatNgn(Math.abs(previewProfit))}
          </p>
        )}
      </FormSection>

      {kind === "service" && (serviceType === "course" || serviceType === "mentorship") && (
        <FormSection title="Course / mentorship dates" hint="Shown on the marketplace so people know when it runs.">
          <label className="block text-xs font-semibold text-muted-foreground">
            Starts
            <Input type="date" className="mt-1 min-h-12 rounded-xl bg-background" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </label>
          <label className="mt-3 block text-xs font-semibold text-muted-foreground">
            Finishes
            <Input type="date" className="mt-1 min-h-12 rounded-xl bg-background" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          </label>
        </FormSection>
      )}

      {kind === "goods" && (
        <FormSection title={t("app.products.stockSection")} hint={t("app.products.stockHint")}>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">
              {t("app.products.initialStockPlaceholder")}
            </span>
            <Input
              className="min-h-12 rounded-xl bg-background"
              inputMode="decimal"
              value={initialStock}
              onChange={(e) => setInitialStock(e.target.value)}
              placeholder="0"
              name="initialStock"
            />
          </label>
          <label className="mt-3 block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">
              {t("app.products.lowStockPlaceholder")}
            </span>
            <Input
              className="min-h-12 rounded-xl bg-background"
              inputMode="decimal"
              value={lowThreshold}
              onChange={(e) => setLowThreshold(e.target.value)}
              placeholder="5"
              name="lowStockThreshold"
            />
          </label>
        </FormSection>
      )}

      {kind === "goods" && (
        <FormSection title={t("app.products.unitSection")}>
          <div className="flex flex-wrap gap-2">
            {goodsUnits.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-semibold",
                  unit === u ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {t(`app.products.units.${u}`)}
              </button>
            ))}
          </div>
        </FormSection>
      )}

      <FormSection title={`${t("app.products.photoSection")} *`} hint={`${t("app.products.photoHint")} At least one photo is required.`}>
        <div className="rounded-2xl bg-muted/40 p-4">
          <ProductPhotosField photos={photos} onChange={setPhotos} />
        </div>
      </FormSection>

      <FormSection title={t("app.products.notesSection")} hint={t("app.products.notesHint")}>
        <textarea
          className="min-h-24 w-full rounded-xl border border-input bg-background px-3 py-2 text-base"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Customer-facing description"
          name="description"
          maxLength={4000}
        />
        <Input
          className="mt-3 min-h-12 rounded-xl bg-background"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t("app.products.notesPlaceholder")}
          name="notes"
        />
      </FormSection>

      <FormSection title="Catalogue" hint="Shown on the storefront. Only business members can change this.">
        <Input
          className="min-h-12 rounded-xl bg-background"
          value={catalogueCategory}
          onChange={(e) => setCatalogueCategory(e.target.value)}
          placeholder="Category (e.g. Foodstuff)"
        />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Input className="min-h-11 rounded-xl" value={size} onChange={(e) => setSize(e.target.value)} placeholder="Size" />
          <Input className="min-h-11 rounded-xl" value={colour} onChange={(e) => setColour(e.target.value)} placeholder="Colour" />
        </div>
        <Input
          className="mt-3 min-h-11 rounded-xl"
          value={sizes}
          onChange={(e) => setSizes(e.target.value)}
          placeholder="Variant sizes, comma separated (S, M, L)"
        />
        <Input
          className="mt-3 min-h-11 rounded-xl"
          value={colours}
          onChange={(e) => setColours(e.target.value)}
          placeholder="Variant colours, comma separated"
        />
        <Input
          className="mt-3 min-h-11 rounded-xl"
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="Product video URL (optional)"
        />
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
          Publish on the marketplace now
        </label>
      </FormSection>

      {publishErrors.length > 0 && isPublished && (
        <ul className="list-disc space-y-1 pl-5 text-xs text-primary">
          {publishErrors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      )}
      {publishWarnings.length > 0 && isPublished && (
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          {publishWarnings.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      )}

      <Button
        type="submit"
        className="min-h-12 w-full rounded-xl bg-teal-700 text-base font-bold shadow-md hover:bg-teal-800"
        disabled={saving || !name.trim()}
      >
        {saving ? t("app.products.saving") : t("app.products.add")}
      </Button>
      <p className="text-center text-xs text-muted-foreground">{t("app.products.saveHint")}</p>
      <p className="text-center text-xs">
        <Link to="/app/products" className="font-semibold text-primary underline-offset-2 hover:underline">
          {t("app.common.back")} → {t("app.products.title")}
        </Link>
      </p>
    </form>
  );
}
