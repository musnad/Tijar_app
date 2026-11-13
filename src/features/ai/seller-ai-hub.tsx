"use client";

import { Image, Mic, Sparkles, TrendingUp } from "lucide-react";
import { useState } from "react";

import { AiCreditsBar } from "@/features/ai/ai-credits-bar";
import { GraphicsPanel } from "@/features/ai/graphics-panel";
import { VoiceListingPanel } from "@/features/ai/voice-listing-panel";
import { VoiceSalePanel } from "@/features/ai/voice-sale-panel";
import { WeeklyReportPanel } from "@/features/ai/weekly-report-panel";
import { useAuth } from "@/features/auth/auth-context";
import { usePrimaryBusiness } from "@/hooks/use-primary-business";
import { useTranslation } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

type Tab = "listing" | "sale" | "graphics" | "report";

export function SellerAiHub() {
  const { t, locale } = useTranslation();
  const { profile } = useAuth();
  const { data, isLoading } = usePrimaryBusiness(profile?.id);
  const business = data?.business;
  const [tab, setTab] = useState<Tab>("listing");
  const language = locale === "ha" ? "Hausa" : "English";

  if (isLoading) {
    return <p className="mt-6 text-sm text-muted-foreground">{t("app.ai.working")}</p>;
  }
  if (!business || !profile) {
    return <p className="mt-6 text-sm text-destructive">{t("app.errors.noBusiness")}</p>;
  }

  const tabs: { id: Tab; label: string; icon: typeof Mic }[] = [
    { id: "listing", label: t("app.ai.tabListing"), icon: Mic },
    { id: "sale", label: t("app.ai.tabSale"), icon: Sparkles },
    { id: "graphics", label: t("app.ai.tabGraphics"), icon: Image },
    { id: "report", label: t("app.ai.tabReport"), icon: TrendingUp },
  ];

  return (
    <div className="mt-4 space-y-4 pb-8">
      <p className="text-sm text-muted-foreground">{t("app.ai.subtitle")}</p>
      <AiCreditsBar />
      <div className="grid grid-cols-4 gap-1 rounded-2xl bg-muted p-1">
        {tabs.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center rounded-xl px-1 text-[10px] font-bold",
                tab === item.id ? "bg-[#0A2540] text-white" : "text-muted-foreground",
              )}
            >
              <Icon className="mb-1 size-4" />
              {item.label}
            </button>
          );
        })}
      </div>
      {tab === "listing" ? (
        <VoiceListingPanel businessId={business.id} profileId={profile.id} language={language} />
      ) : null}
      {tab === "sale" ? (
        <VoiceSalePanel businessId={business.id} profileId={profile.id} language={language} />
      ) : null}
      {tab === "graphics" ? (
        <GraphicsPanel businessName={business.business_name} language={language} />
      ) : null}
      {tab === "report" ? <WeeklyReportPanel businessId={business.id} language={language} /> : null}
    </div>
  );
}
