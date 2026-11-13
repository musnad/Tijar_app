import { createFileRoute, redirect } from "@tanstack/react-router";

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
import { breadcrumbJsonLd, organizationJsonLd, websiteJsonLd } from "@/lib/seo/catalog";
import { parsedShopPlace } from "@/lib/seo/eligibility";
import { PRODUCTION_ORIGIN } from "@/lib/site-url";

export const Route = createFileRoute("/b/$slug")({
  loader: async ({ params, context }) => {
    const page = await fetchPublicShopPage(params.slug);
    if (page.redirectTo) {
      throw redirect({ to: "/b/$slug", params: { slug: page.redirectTo } });
    }
    if (page.business) {
      context?.queryClient?.setQueryData(["storefront", params.slug], {
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
    const url = shopPageUrl(shop.slug || params.slug);
    const place = parsedShopPlace(shop);
    const crumbs = [
      { name: "Tijar", url: PRODUCTION_ORIGIN },
      { name: "Nigeria", url: `${PRODUCTION_ORIGIN}/nigeria` },
    ];
    if (place.state) crumbs.push({ name: place.state, url: `${PRODUCTION_ORIGIN}/nigeria/${encodeURIComponent(place.state.toLowerCase().replace(/\s+/g, "-"))}` });
    crumbs.push({ name: shop.business_name, url });
    return seoHead({
      title: shopSeoTitle(shop),
      description: shopSeoDescription(shop, loaderData.products ?? []),
      url,
      image: absoluteSeoImage(shop.cover_image_url || shop.logo_url),
      noIndex: loaderData.indexable === false,
      jsonLd: [
        organizationJsonLd(),
        websiteJsonLd(),
        breadcrumbJsonLd(crumbs),
        shopJsonLd(shop, loaderData.products ?? []),
      ],
    });
  },
  component: Page,
});

function Page() {
  const { slug } = Route.useParams();
  const initial = Route.useLoaderData();
  return <StorefrontScreen slug={slug} initial={initial} />;
}
