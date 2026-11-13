import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { RouteFallback } from "@/components/route-fallback";
import { marketingSeo } from "@/lib/seo/catalog";

const LocalServicesScreen = lazy(() =>
  import("@/features/marketplace/local-services-screen").then((m) => ({
    default: m.LocalServicesScreen,
  })),
);

export const Route = createFileRoute("/shop/services")({
  head: () =>
    marketingSeo(
      "Local services near you — TIJAR",
      "Search businesses and services in your state and local government area, then call them directly.",
      "/shop/services",
      "local services Nigeria, call a shop, TIJAR",
    ),
  component: ServicesPage,
});

function ServicesPage() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <LocalServicesScreen />
    </Suspense>
  );
}
