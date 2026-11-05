"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { aiPostJson } from "@/lib/ai/seller-ai-client";
import type { ReportCopy } from "@/lib/ai/seller-extract";
import { useTranslation } from "@/lib/i18n/context";
import { formatNgn } from "@/utils/money";
import {
  fetchSavedWeeklyReport,
  fetchWeeklyInsightStats,
  saveWeeklyReport,
} from "@/services/seller-ai-service";

export function WeeklyReportPanel({
  businessId,
  language,
}: {
  businessId: string;
  language: string;
}) {
  const { t, locale } = useTranslation();
  const [copy, setCopy] = useState<ReportCopy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statsQuery = useQuery({
    queryKey: ["weekly-insights", businessId],
    queryFn: () => fetchWeeklyInsightStats(businessId),
  });

  const savedQuery = useQuery({
    queryKey: ["weekly-report-saved", businessId, statsQuery.data?.weekStart],
    enabled: Boolean(statsQuery.data?.weekStart),
    queryFn: () => fetchSavedWeeklyReport(businessId, statsQuery.data!.weekStart),
  });

  const stats = statsQuery.data;
  const saved = savedQuery.data?.data as
    | {
        tip_en?: string;
        tip_ha?: string;
        summary_en?: string;
        summary_ha?: string;
      }
    | null
    | undefined;

  async function generate() {
    if (!stats) return;
    setLoading(true);
    setError(null);
    try {
      const res = await aiPostJson<{ copy: ReportCopy }>("/api/ai/report", { ...stats, language });
      setCopy(res.copy);
      const savedRow = await saveWeeklyReport({
        businessId,
        stats,
        tipEn: res.copy.tipEn,
        tipHa: res.copy.tipHa,
        summaryEn: res.copy.summaryEn,
        summaryHa: res.copy.summaryHa,
      });
      if (savedRow.error) toast.message(savedRow.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("app.ai.saveFailed"));
    } finally {
      setLoading(false);
    }
  }

  const shown = copy ?? (saved
    ? {
        tipEn: saved.tip_en ?? "",
        tipHa: saved.tip_ha ?? "",
        summaryEn: saved.summary_en ?? "",
        summaryHa: saved.summary_ha ?? "",
      }
    : null);

  if (statsQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">{t("app.ai.working")}</p>;
  }

  return (
    <section className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("app.ai.reportHint")}</p>
      {stats ? (
        <div className="grid grid-cols-2 gap-2">
          <Stat label={t("app.ai.views")} value={String(stats.profileViews)} />
          <Stat label={t("app.ai.taps")} value={String(stats.callClicks + stats.whatsappClicks)} />
          <Stat label={t("app.ai.salesCount")} value={String(stats.salesCount)} />
          <Stat label={t("app.ai.salesTotal")} value={formatNgn(stats.salesTotal)} />
        </div>
      ) : null}
      <Button
        type="button"
        className="min-h-12 w-full rounded-xl bg-[#0A2540] text-white"
        disabled={loading || !stats}
        onClick={() => void generate()}
      >
        {loading ? t("app.ai.working") : t("app.ai.makeReport")}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {shown ? (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm leading-relaxed">{locale === "ha" ? shown.summaryHa : shown.summaryEn}</p>
          {locale === "ha" ? null : <p className="text-sm text-muted-foreground">{shown.summaryHa}</p>}
          <div className="rounded-xl bg-[#E8F8F0] p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-[#00B86B]">{t("app.ai.tip")}</p>
            <p className="mt-1 text-sm font-medium text-[#0A2540]">{locale === "ha" ? shown.tipHa : shown.tipEn}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#0A2540] p-3 text-white">
      <p className="text-[11px] text-white/70">{label}</p>
      <p className="mt-1 text-xl font-extrabold">{value}</p>
    </div>
  );
}
