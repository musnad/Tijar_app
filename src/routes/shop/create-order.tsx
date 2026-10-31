import { createFileRoute } from "@tanstack/react-router";

import { PlaceOrderComposeScreen } from "@/features/marketplace/place-order-compose-screen";

export const Route = createFileRoute("/shop/create-order")({
  component: PlaceOrderComposeScreen,
});
