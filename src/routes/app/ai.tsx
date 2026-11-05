import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/features/app/app-shell";
import { AppPageHeader } from "@/features/app-layout/app-page-header";
import { RequireAuth } from "@/features/app/require-auth";
import { RouteFallback } from "@/components/route-fallback";
import { useTranslation } from "@/lib/i18n/context";

const SellerAiHub = lazy(() =>
  import("@/features/ai/seller-ai-hub").then((m) => ({ default: m.SellerAiHub })),
);

export const Route = createFileRoute("/app/ai")({
  component: SellerAiPage,
});

function SellerAiPage() {
  const { t } = useTranslation();
  return (
    <RequireAuth>
      <AppShell>
        <AppPageHeader title={t("app.ai.title")} subtitle={t("app.ai.subtitle")} />
        <Suspense fallback={<RouteFallback />}>
          <SellerAiHub />
        </Suspense>
      </AppShell>
    </RequireAuth>
  );
}
