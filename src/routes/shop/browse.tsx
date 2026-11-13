import { createFileRoute } from "@tanstack/react-router";

import { ShopBrowseScreen } from "@/features/marketplace/shop-browse-screen";
import { marketingSeo } from "@/lib/seo/catalog";

export const Route = createFileRoute("/shop/browse")({
  head: () =>
    marketingSeo(
      "Browse products on TIJAR",
      "Browse goods and services from Nigerian shops. Buy on tijar.ng.",
      "/shop/browse",
      "browse products Nigeria, TIJAR marketplace",
    ),
  component: ShopBrowseScreen,
});
