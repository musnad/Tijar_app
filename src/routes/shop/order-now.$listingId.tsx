import { createFileRoute } from "@tanstack/react-router";

import { PlaceOrderDetailScreen } from "@/features/marketplace/place-order-detail-screen";
import {
  fetchPublicListing,
  listingPageUrl,
  listingSeoDescription,
  listingSeoTitle,
  organizationJsonLd,
} from "@/lib/seo/catalog";
import { absoluteSeoImage, seoHead } from "@/lib/seo/public-shop";

export const Route = createFileRoute("/shop/order-now/$listingId")({
  loader: async ({ params }) => {
    const listing = await fetchPublicListing(params.listingId);
    return { listing };
  },
  head: ({ loaderData, params }) => {
    const listing = loaderData?.listing;
    if (!listing) {
      return seoHead({
        title: "Place your order on TIJAR",
        description: "Order food and goods from local shops on tijar.ng.",
        url: listingPageUrl(params.listingId),
        image: absoluteSeoImage(null),
        noIndex: true,
      });
    }
    return seoHead({
      title: listingSeoTitle(listing),
      description: listingSeoDescription(listing),
      url: listingPageUrl(listing.id),
      image: absoluteSeoImage(listing.image_urls[0]),
      keywords: `${listing.title}, ${listing.shop_name}, order ${listing.title}, TIJAR`,
      jsonLd: [
        organizationJsonLd(),
        {
          "@context": "https://schema.org",
          "@type": "Offer",
          name: listing.title,
          url: listingPageUrl(listing.id),
          price: String(listing.price),
          priceCurrency: "NGN",
          availability: listing.is_open ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
        },
      ],
    });
  },
  component: Page,
});

function Page() {
  const { listingId } = Route.useParams();
  return <PlaceOrderDetailScreen listingId={listingId} />;
}
