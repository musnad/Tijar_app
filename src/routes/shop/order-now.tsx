import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/shop/order-now")({
  component: ShopOrderNowLayout,
});

function ShopOrderNowLayout() {
  return <Outlet />;
}
