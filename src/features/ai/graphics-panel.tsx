"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { composeSpotlightFrame } from "@/lib/ai/compose-spotlight";
import { aiPostJson } from "@/lib/ai/seller-ai-client";
import type { GraphicsFrame } from "@/lib/ai/seller-extract";
import { fileToJpegDataUrl } from "@/lib/marketing/resize-image";
import { useTranslation } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

const FRAMES: GraphicsFrame[] = ["spotlight", "week", "feature"];

export function GraphicsPanel({
  businessName,
  language,
}: {
  businessName: string;
  language: string;
}) {
  const { t } = useTranslation();
  const [frame, setFrame] = useState<GraphicsFrame>("spotlight");
  const [productName, setProductName] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      setPhoto(await fileToJpegDataUrl(file, 900, 0.84));
      setResult(null);
    } catch {
      setError(t("app.ai.photoFailed"));
    }
  }

  async function generate() {
    if (!photo) {
      setError(t("app.ai.needPhoto"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const grok = await aiPostJson<{ dataUrl: string | null; warning?: string }>("/api/ai/graphics", {
        frame,
        businessName,
        productName: productName.trim() || null,
        photoDataUrl: photo,
        locale: language,
      });
      const poster = await composeSpotlightFrame({
        frame,
        businessName,
        productName: productName.trim() || null,
        photoUrl: photo,
        grokUrl: grok.dataUrl,
      });
      setResult(poster);
      if (grok.warning) toast.message(grok.warning);
    } catch (err) {
      try {
        const poster = await composeSpotlightFrame({
          frame,
          businessName,
          productName: productName.trim() || null,
          photoUrl: photo,
        });
        setResult(poster);
        toast.message(err instanceof Error ? err.message : t("app.ai.graphicsFallback"));
      } catch {
        setError(err instanceof Error ? err.message : t("app.ai.saveFailed"));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("app.ai.graphicsHint")}</p>
      <div className="grid grid-cols-3 gap-2">
        {FRAMES.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setFrame(id)}
            className={cn(
              "min-h-12 rounded-xl px-2 text-xs font-bold",
              frame === id ? "bg-[#0A2540] text-white" : "bg-muted text-muted-foreground",
            )}
          >
            {t(`app.ai.frame.${id}`)}
          </button>
        ))}
      </div>
      <Input
        className="min-h-11 rounded-xl"
        value={productName}
        onChange={(e) => setProductName(e.target.value)}
        placeholder={t("app.ai.optionalProduct")}
      />
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="block w-full text-sm"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="h-36 w-full rounded-xl object-cover" />
      ) : null}
      <Button
        type="button"
        className="min-h-12 w-full rounded-xl bg-[#00B86B] text-white hover:bg-[#00A05E]"
        disabled={loading}
        onClick={() => void generate()}
      >
        {loading ? t("app.ai.working") : t("app.ai.makePoster")}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {result ? (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={result} alt="TIJAR poster" className="w-full rounded-2xl" />
          <a
            href={result}
            download={`tijar-${frame}.jpg`}
            className="block min-h-12 rounded-xl bg-[#0A2540] px-4 py-3 text-center text-sm font-bold text-white"
          >
            {t("app.ai.downloadPoster")}
          </a>
        </div>
      ) : null}
    </section>
  );
}
