import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/features/app/app-shell";
import { AppPageHeader } from "@/features/app-layout/app-page-header";
import { RequireAuth } from "@/features/app/require-auth";
import { RouteFallback } from "@/components/route-fallback";

const AssistantScreen = lazy(() =>
  import("@/features/assistant/assistant-screen").then((m) => ({ default: m.AssistantScreen })),
);

export const Route = createFileRoute("/app/assistant")({
  component: AssistantPage,
});

function AssistantPage() {
  return (
    <RequireAuth>
      <AppShell>
        <AppPageHeader title="Talk to TIJAR" subtitle="Sales and expenses, by voice" />
        <Suspense fallback={<RouteFallback />}>
          <AssistantScreen />
        </Suspense>
      </AppShell>
    </RequireAuth>
  );
}
