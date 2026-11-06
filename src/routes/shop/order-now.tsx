import { createFileRoute } from "@tanstack/react-router";

import { PlaceOrderBoardScreen } from "@/features/marketplace/place-order-board-screen";

export const Route = createFileRoute("/shop/order-now")({
  component: PlaceOrderBoardScreen,
});
