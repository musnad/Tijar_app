import { createFileRoute } from "@tanstack/react-router";

import { DiscoverScreen } from "@/features/discover/discover-screen";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo/catalog";
import { absoluteSeoImage, seoHead } from "@/lib/seo/public-shop";
import { PRODUCTION_ORIGIN } from "@/lib/site-url";

export const Route = createFileRoute("/discover")({
  head: () =>
    seoHead({
      title: "Discover local businesses — TIJAR",
      description:
        "Find real local shops, food sellers, tailors, mechanics and services near you on TIJAR. Call, message or get directions.",
      url: `${PRODUCTION_ORIGIN}/discover`,
      image: absoluteSeoImage("/tijar-logo.png"),
      keywords: "local shops Nigeria, discover businesses, TIJAR, tijar.ng",
      jsonLd: [organizationJsonLd(), websiteJsonLd()],
    }),
  component: DiscoverScreen,
});
