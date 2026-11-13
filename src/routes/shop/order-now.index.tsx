import { createFileRoute } from "@tanstack/react-router";

import { PlaceOrderBoardScreen } from "@/features/marketplace/place-order-board-screen";
import { marketingSeo } from "@/lib/seo/catalog";

export const Route = createFileRoute("/shop/order-now/")({
  head: () =>
    marketingSeo(
      "Place your order — TIJAR",
      "Order food and goods from local shops near you. Pay and pick up on TIJAR.",
      "/shop/order-now",
      "place your order, food near me Nigeria, TIJAR",
    ),
  component: PlaceOrderBoardScreen,
});
