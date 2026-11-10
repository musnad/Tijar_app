import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { RouteFallback } from "@/components/route-fallback";

const AgentShopDetailScreen = lazy(() =>
  import("@/features/agent/agent-shop-detail-screen").then((m) => ({ default: m.AgentShopDetailScreen })),
);

export const Route = createFileRoute("/shop/agent/$shopId")({
  head: () => ({
    meta: [{ title: "Agent shop — TIJAR" }],
  }),
  component: function AgentShopPage() {
    const { shopId } = Route.useParams();
    return (
      <Suspense fallback={<RouteFallback />}>
        <AgentShopDetailScreen shopId={shopId} />
      </Suspense>
    );
  },
});
