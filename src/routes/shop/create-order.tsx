import { createFileRoute } from "@tanstack/react-router";

import { PlaceOrderComposeScreen } from "@/features/marketplace/place-order-compose-screen";

export const Route = createFileRoute("/shop/create-order")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: search.tab === "orders" ? ("orders" as const) : ("post" as const),
  }),
  component: PlaceOrderComposeScreen,
});
