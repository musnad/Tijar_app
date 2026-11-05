"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HoldToTalk } from "@/features/ai/hold-to-talk";
import { aiPostJson } from "@/lib/ai/seller-ai-client";
import type { ListingExtract } from "@/lib/ai/seller-extract";
import { useTranslation } from "@/lib/i18n/context";
import { createProduct } from "@/services/product-service";
import { updateShopLocation } from "@/services/seller-ai-service";

export function VoiceListingPanel({
  businessId,
  profileId,
  language,
}: {
  businessId: string;
  profileId: string;
  language: string;
}) {
  const { t, locale } = useTranslation();
  const [text, setText] = useState("");
  const { listing, setListing, loading, error, extract } = useListingExtract();
  const [saving, setSaving] = useState(false);

  async function runExtract(raw: string) {
    setText(raw);
    await extract(raw, language);
  }

  async function save() {
    if (!listing) return;
    setSaving(true);
    try {
      const { product, error: saveError } = await createProduct(businessId, profileId, {
        name: listing.productName,
        kind: "goods",
        unit: listing.unit || "piece",
        salePrice: listing.priceNaira ?? undefined,
        description: locale === "ha" ? listing.descriptionHa : `${listing.descriptionEn}\n\n${listing.descriptionHa}`,
        notes: listing.notes ?? undefined,
        isPublished: listing.priceNaira != null && listing.priceNaira > 0,
      });
      if (saveError && !product) throw new Error(saveError);
      if (listing.location) {
        const loc = await updateShopLocation(businessId, listing.location);
        if (loc.error) toast.message(loc.error);
      }
      toast.success(t("app.ai.listingSaved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("app.ai.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("app.ai.listingHint")}</p>
      <HoldToTalk language={language} onTranscript={(s) => void runExtract(s)} label={t("app.ai.holdSpeak")} />
      <textarea
        className="min-h-24 w-full rounded-2xl border border-input bg-background px-3 py-2 text-base"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t("app.ai.listingPlaceholder")}
      />
      <Button
        type="button"
        variant="outline"
        className="min-h-12 w-full rounded-xl"
        disabled={loading || text.trim().length < 3}
        onClick={() => void runExtract(text)}
      >
        {loading ? t("app.ai.working") : t("app.ai.useText")}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {listing ? (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <Field label={t("app.ai.productName")} value={listing.productName} onChange={(v) => setListing({ ...listing, productName: v })} />
          <Field
            label={t("app.ai.price")}
            value={listing.priceNaira != null ? String(listing.priceNaira) : ""}
            onChange={(v) => setListing({ ...listing, priceNaira: Number(v) || null })}
          />
          <Field
            label={t("app.ai.location")}
            value={listing.location ?? ""}
            onChange={(v) => setListing({ ...listing, location: v || null })}
          />
          <label className="block text-xs font-semibold text-muted-foreground">
            {t("app.ai.descriptionEn")}
            <textarea
              className="mt-1 min-h-20 w-full rounded-xl border border-input px-3 py-2 text-sm text-foreground"
              value={listing.descriptionEn}
              onChange={(e) => setListing({ ...listing, descriptionEn: e.target.value })}
            />
          </label>
          <label className="block text-xs font-semibold text-muted-foreground">
            {t("app.ai.descriptionHa")}
            <textarea
              className="mt-1 min-h-20 w-full rounded-xl border border-input px-3 py-2 text-sm text-foreground"
              value={listing.descriptionHa}
              onChange={(e) => setListing({ ...listing, descriptionHa: e.target.value })}
            />
          </label>
          <Button
            type="button"
            className="min-h-12 w-full rounded-xl bg-[#00B86B] text-white hover:bg-[#00A05E]"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? t("app.ai.saving") : t("app.ai.saveListing")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-xs font-semibold text-muted-foreground">
      {label}
      <Input className="mt-1 min-h-11 rounded-xl" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function useListingExtract() {
  const [listing, setListing] = useState<ListingExtract | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function extract(text: string, language: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await aiPostJson<{ listing: ListingExtract }>("/api/ai/listing", {
        text,
        language,
      });
      setListing(res.listing);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not understand that.");
    } finally {
      setLoading(false);
    }
  }

  return { listing, setListing, loading, error, extract };
}
