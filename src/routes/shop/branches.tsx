import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { RouteFallback } from "@/components/route-fallback";

const BranchShopsScreen = lazy(() =>
  import("@/features/business/branch-shops-screen").then((m) => ({ default: m.BranchShopsScreen })),
);

export const Route = createFileRoute("/shop/branches")({
  head: () => ({
    meta: [{ title: "Branch shops — TIJAR" }],
  }),
  component: function BranchShopsPage() {
    return (
      <Suspense fallback={<RouteFallback />}>
        <BranchShopsScreen />
      </Suspense>
    );
  },
});
