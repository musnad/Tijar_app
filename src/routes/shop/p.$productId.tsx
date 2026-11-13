import { createFileRoute } from "@tanstack/react-router";

import { ProductDetailScreen } from "@/features/marketplace/product-detail-screen";

export const Route = createFileRoute("/shop/p/$productId")({
  head: ({ params }) => ({
    meta: [
      { title: "Order on TIJAR" },
      { name: "description", content: "Open this product on tijar.ng to buy or place an order." },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "Order on TIJAR" },
      { property: "og:description", content: "Tap to buy this post on tijar.ng" },
      { property: "og:url", content: `https://www.tijar.ng/shop/p/${params.productId}` },
      { property: "og:image", content: "https://www.tijar.ng/tijar-logo.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProductDetailPage,
});

function ProductDetailPage() {
  const { productId } = Route.useParams();
  return <ProductDetailScreen productId={productId} />;
}
