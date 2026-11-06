import { createFileRoute } from "@tanstack/react-router";

import { BuyScreen } from "@/features/marketplace/buy-screen";

export const Route = createFileRoute("/shop/buy")({
  validateSearch: (s: Record<string, unknown>) => ({
    productId: typeof s.productId === "string" ? s.productId : undefined,
    qty: typeof s.qty === "number" && Number.isFinite(s.qty) ? s.qty : typeof s.qty === "string" && Number(s.qty) > 0 ? Number(s.qty) : undefined,
  }),
  component: Page,
});

function Page() {
  const { productId, qty } = Route.useSearch();
  return <BuyScreen productId={productId} initialQty={qty} />;
}
