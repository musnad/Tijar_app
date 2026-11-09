import { createFileRoute } from "@tanstack/react-router";

import { NearbyScreen } from "@/features/marketplace/nearby-screen";

export const Route = createFileRoute("/shop/nearby")({
  head: () => ({
    meta: [
      { title: "Near me — TIJAR Marketplace" },
      {
        name: "description",
        content: "See businesses around you on the map and open shops near your location on TIJAR.",
      },
    ],
  }),
  component: NearbyScreen,
});
