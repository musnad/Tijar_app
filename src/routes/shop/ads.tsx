import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { RouteFallback } from "@/components/route-fallback";

const AdsManagerScreen = lazy(() =>
  import("@/features/ads/ads-manager-screen").then((m) => ({ default: m.AdsManagerScreen })),
);

export const Route = createFileRoute("/shop/ads")({
  component: ShopAdsPage,
});

function ShopAdsPage() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <AdsManagerScreen />
    </Suspense>
  );
}
