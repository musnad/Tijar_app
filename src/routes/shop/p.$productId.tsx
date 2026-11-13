import { createFileRoute } from "@tanstack/react-router";

import { ProductDetailScreen } from "@/features/marketplace/product-detail-screen";
import {
  absoluteSeoImage,
  fetchPublicProduct,
  productJsonLd,
  productPageUrl,
  productSeoDescription,
  productSeoKeywords,
  productSeoTitle,
  seoHead,
} from "@/lib/seo/public-shop";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo/catalog";

export const Route = createFileRoute("/shop/p/$productId")({
  loader: async ({ params, context }) => {
    const product = await fetchPublicProduct(params.productId);
    if (product) {
      context.queryClient.setQueryData(["marketplace-product", params.productId], product);
    }
    return { product };
  },
  head: ({ loaderData, params }) => {
    const product = loaderData?.product;
    if (!product) {
      return seoHead({
        title: "Product on TIJAR",
        description: "Buy this product on tijar.ng.",
        url: productPageUrl(params.productId),
        image: absoluteSeoImage(null),
        noIndex: true,
      });
    }
    return seoHead({
      title: productSeoTitle(product),
      description: productSeoDescription(product),
      url: productPageUrl(product.id),
      image: absoluteSeoImage(product.image_url),
      keywords: productSeoKeywords(product),
      jsonLd: [organizationJsonLd(), websiteJsonLd(), productJsonLd(product)],
    });
  },
  component: ProductDetailPage,
});

function ProductDetailPage() {
  const { productId } = Route.useParams();
  const { product } = Route.useLoaderData();
  return <ProductDetailScreen productId={productId} initial={product} />;
}
