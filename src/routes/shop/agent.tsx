import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { RouteFallback } from "@/components/route-fallback";

const AgentSetupScreen = lazy(() =>
  import("@/features/agent/agent-setup-screen").then((m) => ({ default: m.AgentSetupScreen })),
);

export const Route = createFileRoute("/shop/agent")({
  head: () => ({
    meta: [{ title: "Set up a business — TIJAR agent" }],
  }),
  component: function AgentPage() {
    return (
      <Suspense fallback={<RouteFallback />}>
        <AgentSetupScreen />
      </Suspense>
    );
  },
});
