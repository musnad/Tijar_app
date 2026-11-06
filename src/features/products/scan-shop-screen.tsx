"use client";

import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  Check,
  ImagePlus,
  Loader2,
  Package,
  RotateCcw,
  Store,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/auth-context";
import { normalizeMoneyRaw } from "@/features/products/schemas";
import { usePrimaryBusiness } from "@/hooks/use-primary-business";
import { invalidateBusinessQueries } from "@/lib/invalidate-business-queries";
import { useTranslation } from "@/lib/i18n/context";
import { extractTextFromImage } from "@/lib/ocr/provider";
import { cn } from "@/lib/utils";
import { createProduct } from "@/services/product-service";
import {
  PRODUCT_CATEGORIES,
  categoryNote,
  parseShopShelf,
  type ProductCategoryId,
  type ShopShelfItem,
} from "@/utils/shop-shelf";

type Step = "pick" | "reading" | "review";

function softMoney(raw: string): number | undefined {
  const n = normalizeMoneyRaw(raw);
  if (!n || !/^\d+(\.\d{1,2})?$/.test(n)) return undefined;
  return Number.parseFloat(n);
}

export function ScanShopScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { data } = usePrimaryBusiness(profile?.id);
  const business = data?.business ?? null;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("pick");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [items, setItems] = useState<ShopShelfItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [rawOcr, setRawOcr] = useState("");

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setStep("pick");
    setProgress(0);
    setItems([]);
    setRawOcr("");
    if (cameraRef.current) cameraRef.current.value = "";
    if (galleryRef.current) galleryRef.current.value = "";
  }

  function updateItem(id: string, patch: Partial<ShopShelfItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  function addBlankRow() {
    setItems((prev) => [
      ...prev,
      {
        id: `manual-${Date.now()}`,
        name: "",
        category: "other",
        unit: "piece",
        costPrice: "",
        salePrice: "",
        selected: true,
      },
    ]);
  }

  async function processFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error(t("app.shopScan.needImage"));
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setStep("reading");
    setProgress(0);

    try {
      const result = await extractTextFromImage(file, (p) => {
        setProgress(Math.round(p.progress * 100));
      });
      const text = result.text.trim();
      setRawOcr(text);
      const parsed = parseShopShelf(text);
      if (parsed.length === 0) {
        setItems([
          {
            id: `manual-${Date.now()}`,
            name: "",
            category: "other",
            unit: "piece",
            costPrice: "",
            salePrice: "",
            selected: true,
          },
        ]);
        toast.message(t("app.shopScan.noneFound"));
      } else {
        setItems(parsed);
        toast.success(t("app.shopScan.foundCount").replace("{count}", String(parsed.length)));
      }
      setStep("review");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("app.shopScan.failed"));
      reset();
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void processFile(file);
  }

  async function saveAll() {
    if (!business || !profile) {
      toast.error(t("app.assistant.finishBusinessFirst"));
      return;
    }

    const chosen = items.filter((it) => it.selected && it.name.trim());
    if (chosen.length === 0) {
      toast.error(t("app.shopScan.needOneProduct"));
      return;
    }

    const missingPrice = chosen.filter((it) => !softMoney(it.salePrice) && !softMoney(it.costPrice));
    if (missingPrice.length === chosen.length) {
      toast.error(t("app.shopScan.needPrices"));
      return;
    }

    setSaving(true);
    let saved = 0;
    let failed = 0;

    for (const it of chosen) {
      const sale = softMoney(it.salePrice);
      const cost = softMoney(it.costPrice);
      if (sale == null && cost == null) {
        failed += 1;
        continue;
      }
      const { product, error } = await createProduct(business.id, profile.id, {
        name: it.name.trim(),
        kind: "goods",
        unit: it.unit || "piece",
        ...(sale != null ? { salePrice: sale } : {}),
        ...(cost != null ? { costPrice: cost } : {}),
        initialStock: 1,
        isPublished: sale != null,
        notes: categoryNote(it.category),
      });
      if (product) saved += 1;
      else {
        failed += 1;
        if (error) console.warn(error);
      }
    }

    setSaving(false);
    await invalidateBusinessQueries(queryClient, business.id);

    if (saved > 0) {
      toast.success(t("app.shopScan.savedCount").replace("{count}", String(saved)));
      void navigate({ to: "/app/products" });
      return;
    }
    toast.error(t("app.shopScan.saveFailed"));
  }

  const selectedCount = items.filter((i) => i.selected && i.name.trim()).length;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 pb-8">
      <section className="dashboard-summary-card relative overflow-hidden rounded-3xl p-5 text-primary-foreground shadow-xl">
        <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
            <Store className="size-6" />
          </span>
          <div>
            <h2 className="text-lg font-extrabold leading-tight">{t("app.shopScan.title")}</h2>
            <p className="text-xs text-white/75">{t("app.shopScan.subtitle")}</p>
          </div>
        </div>
        <p className="relative mt-3 text-sm leading-relaxed text-white/85">{t("app.shopScan.heroBody")}</p>
      </section>

      {step === "pick" && (
        <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="flex min-h-[7.5rem] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-teal-500/40 bg-teal-50/50 px-4 py-6 dark:bg-teal-950/20"
            >
              <Camera className="size-8 text-teal-700" />
              <span className="text-sm font-bold">{t("app.shopScan.takePhoto")}</span>
              <span className="text-center text-xs text-muted-foreground">
                {t("app.shopScan.takePhotoHint")}
              </span>
            </button>
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className="flex min-h-[7.5rem] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-muted/40 px-4 py-6"
            >
              <ImagePlus className="size-8 text-muted-foreground" />
              <span className="text-sm font-bold">{t("app.shopScan.choosePhoto")}</span>
              <span className="text-center text-xs text-muted-foreground">
                {t("app.shopScan.choosePhotoHint")}
              </span>
            </button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">{t("app.shopScan.privacyNote")}</p>
          <p className="mt-3 text-center text-xs">
            <Link
              to="/app/products/new"
              className="font-semibold text-primary underline-offset-2 hover:underline"
            >
              {t("app.shopScan.addManually")}
            </Link>
          </p>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={onPick}
          />
          <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
        </section>
      )}

      {step === "reading" && (
        <section className="rounded-3xl border border-border bg-card p-6 text-center shadow-sm">
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" className="mx-auto mb-4 max-h-48 rounded-2xl object-contain" />
          )}
          <Loader2 className="mx-auto size-8 animate-spin text-teal-700" />
          <p className="mt-3 text-sm font-semibold">{t("app.shopScan.reading")}</p>
          <div className="mx-auto mt-3 h-2 w-full max-w-xs overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-teal-700 transition-all"
              style={{ width: `${Math.min(100, Math.max(4, progress))}%` }}
            />
          </div>
        </section>
      )}

      {step === "review" && (
        <section className="space-y-3">
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt=""
              className="max-h-36 w-full rounded-2xl object-cover object-center ring-1 ring-border"
            />
          )}

          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <p className="text-sm font-bold">{t("app.shopScan.reviewTitle")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("app.shopScan.reviewHint")}</p>
          </div>

          {items.map((it) => (
            <article
              key={it.id}
              className={cn(
                "rounded-2xl border bg-card p-4 shadow-sm",
                it.selected ? "border-border" : "border-dashed opacity-60",
              )}
            >
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={it.selected}
                  onChange={(e) => updateItem(it.id, { selected: e.target.checked })}
                  className="mt-2 size-4 accent-teal-700"
                  aria-label={t("app.shopScan.include")}
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <Input
                    className="min-h-11 rounded-xl bg-background font-semibold"
                    value={it.name}
                    onChange={(e) => updateItem(it.id, { name: e.target.value })}
                    placeholder={t("app.products.namePlaceholder")}
                  />
                  <select
                    value={it.category}
                    onChange={(e) =>
                      updateItem(it.id, { category: e.target.value as ProductCategoryId })
                    }
                    className="min-h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
                  >
                    {PRODUCT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {t(`app.shopScan.categories.${c}`)}
                      </option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-bold uppercase text-muted-foreground">
                        {t("app.shopScan.costLabel")}
                      </span>
                      <Input
                        className="min-h-11 rounded-xl bg-background"
                        inputMode="decimal"
                        value={it.costPrice}
                        onChange={(e) => updateItem(it.id, { costPrice: e.target.value })}
                        placeholder="e.g. 12k"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-bold uppercase text-muted-foreground">
                        {t("app.shopScan.saleLabel")}
                      </span>
                      <Input
                        className="min-h-11 rounded-xl bg-background"
                        inputMode="decimal"
                        value={it.salePrice}
                        onChange={(e) => updateItem(it.id, { salePrice: e.target.value })}
                        placeholder="e.g. 15k"
                      />
                    </label>
                  </div>
                </div>
                <button
                  type="button"
                  className="mt-1 rounded-lg p-2 text-muted-foreground hover:bg-muted"
                  onClick={() => removeItem(it.id)}
                  aria-label={t("app.shopScan.remove")}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </article>
          ))}

          <Button type="button" variant="outline" className="min-h-11 w-full rounded-xl" onClick={addBlankRow}>
            <Package className="mr-1.5 size-4" /> {t("app.shopScan.addRow")}
          </Button>

          {rawOcr && (
            <details className="rounded-xl bg-muted/50 px-3 py-2 text-xs">
              <summary className="cursor-pointer font-semibold text-muted-foreground">
                {t("app.shopScan.rawText")}
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-foreground/80">{rawOcr}</p>
            </details>
          )}

          <Button
            type="button"
            className="min-h-12 w-full rounded-xl bg-teal-700 text-base font-bold hover:bg-teal-800"
            disabled={saving || selectedCount === 0 || !business}
            onClick={() => void saveAll()}
          >
            <Check className="mr-1.5 size-5" />
            {saving
              ? t("app.products.saving")
              : t("app.shopScan.saveAll").replace("{count}", String(selectedCount))}
          </Button>
          <Button type="button" variant="ghost" className="w-full rounded-xl" onClick={reset}>
            <RotateCcw className="mr-1.5 size-4" /> {t("app.shopScan.scanAgain")}
          </Button>
        </section>
      )}
    </div>
  );
}
