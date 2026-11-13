import { createFileRoute } from "@tanstack/react-router";

import { PlaceOrderDetailScreen } from "@/features/marketplace/place-order-detail-screen";

export const Route = createFileRoute("/shop/order-now/$listingId")({
  head: ({ params }) => ({
    meta: [
      { title: "Place your order on TIJAR" },
      { name: "description", content: "Open this post on tijar.ng to place your order." },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "Place your order on TIJAR" },
      { property: "og:description", content: "Tap to order this post on tijar.ng" },
      { property: "og:url", content: `https://www.tijar.ng/shop/order-now/${params.listingId}` },
      { property: "og:image", content: "https://www.tijar.ng/tijar-logo.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

function Page() {
  const { listingId } = Route.useParams();
  return <PlaceOrderDetailScreen listingId={listingId} />;
}
