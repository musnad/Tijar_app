"use client";

import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { NativePageHeader, nativeCanvasClass } from "@/features/marketplace/native-page-header";
import { useTranslation } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

const TOPICS = [
  "profile",
  "privacy",
  "orders",
  "selling",
  "ads",
  "shops",
  "notifications",
  "location",
  "translator",
  "learn",
  "talk",
  "safety",
] as const;

export function ShopHelpScreen() {
  const { t } = useTranslation();
  return (
    <MarketplaceShell hideTopBar variant="feed">
      <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", nativeCanvasClass())}>
        <NativePageHeader title={t("shop.help.title")} subtitle={t("shop.help.subtitle")} showBack />
        <div
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-8"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <ul className="mt-5 space-y-3">
            {TOPICS.map((id) => (
              <li key={id} className="rounded-2xl border border-border bg-white p-4">
                <p className="font-extrabold text-[color:var(--brand-navy,#001B3A)]">{t(`shop.help.${id}Title`)}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t(`shop.help.${id}Body`)}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </MarketplaceShell>
  );
}
