import { createFileRoute } from "@tanstack/react-router";

import { NearbyScreen } from "@/features/marketplace/nearby-screen";
import { marketingSeo } from "@/lib/seo/catalog";

export const Route = createFileRoute("/shop/nearby")({
  head: () =>
    marketingSeo(
      "Shops near me — TIJAR",
      "See businesses around you on the map and open shops near your location on TIJAR.",
      "/shop/nearby",
      "shops near me Nigeria, TIJAR map",
    ),
  component: NearbyScreen,
});
