import { createFileRoute } from "@tanstack/react-router";

import { PlaceOrderDetailScreen } from "@/features/marketplace/place-order-detail-screen";

export const Route = createFileRoute("/shop/order-now/$listingId")({
  component: Page,
});

function Page() {
  const { listingId } = Route.useParams();
  return <PlaceOrderDetailScreen listingId={listingId} />;
}
