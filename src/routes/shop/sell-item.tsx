import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { RouteFallback } from "@/components/route-fallback";

const SellItemScreen = lazy(() =>
  import("@/features/marketplace/sell-item-screen").then((m) => ({
    default: m.SellItemScreen,
  })),
);

export const Route = createFileRoute("/shop/sell-item")({
  head: () => ({
    meta: [
      { title: "Sell an item from home — TIJAR" },
      {
        name: "description",
        content:
          "Post a second-hand item to sell from your house — free or paid. No business account needed.",
      },
    ],
  }),
  component: SellItemPage,
});

function SellItemPage() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <SellItemScreen />
    </Suspense>
  );
}
