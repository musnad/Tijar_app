import { createFileRoute } from "@tanstack/react-router";

import { StorefrontScreen } from "@/features/discover/storefront-screen";
import {
  absoluteSeoImage,
  fetchPublicShopPage,
  seoHead,
  shopJsonLd,
  shopPageUrl,
  shopSeoDescription,
  shopSeoTitle,
} from "@/lib/seo/public-shop";

export const Route = createFileRoute("/b/$slug")({
  loader: async ({ params, context }) => {
    const page = await fetchPublicShopPage(params.slug);
    if (page.business) {
      context.queryClient.setQueryData(["storefront", params.slug], {
        business: page.business,
        products: page.products,
        videos: [],
        error: page.error,
      });
    }
    return page;
  },
  head: ({ loaderData, params }) => {
    const shop = loaderData?.business;
    if (!shop) {
      return seoHead({
        title: "Shop on TIJAR",
        description: "Find local shops on TIJAR — watch, follow, and order on tijar.ng.",
        url: shopPageUrl(params.slug),
        image: absoluteSeoImage(null),
        noIndex: true,
      });
    }
    return seoHead({
      title: shopSeoTitle(shop),
      description: shopSeoDescription(shop, loaderData.products ?? []),
      url: shopPageUrl(shop.slug || params.slug),
      image: absoluteSeoImage(shop.cover_image_url || shop.logo_url),
      jsonLd: shopJsonLd(shop, loaderData.products ?? []),
    });
  },
  component: Page,
});

function Page() {
  const { slug } = Route.useParams();
  const initial = Route.useLoaderData();
  return <StorefrontScreen slug={slug} initial={initial} />;
}
