import { createFileRoute } from "@tanstack/react-router";

import { PlaceOrderDetailScreen } from "@/features/marketplace/place-order-detail-screen";

export const Route = createFileRoute("/shop/order-now/$listingId")({
  validateSearch: (s: Record<string, unknown>) => ({
    form: s.form === true || s.form === "true" || s.form === "1" ? true : undefined,
  }),
  component: Page,
});

function Page() {
  const { listingId } = Route.useParams();
  const { form } = Route.useSearch();
  return <PlaceOrderDetailScreen listingId={listingId} openForm={Boolean(form)} />;
}
