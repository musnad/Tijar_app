import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { RouteFallback } from "@/components/route-fallback";

const LocalServicesScreen = lazy(() =>
  import("@/features/marketplace/local-services-screen").then((m) => ({
    default: m.LocalServicesScreen,
  })),
);

export const Route = createFileRoute("/shop/services")({
  head: () => ({
    meta: [
      { title: "Local services near you — TIJAR" },
      {
        name: "description",
        content:
          "Search businesses and services in your state and local government area, then call them directly.",
      },
    ],
  }),
  component: ServicesPage,
});

function ServicesPage() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <LocalServicesScreen />
    </Suspense>
  );
}
