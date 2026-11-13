import { createFileRoute, redirect } from "@tanstack/react-router";

import { SocialLanding } from "@/features/marketing/social-landing";
import { isTijarNativeApp } from "@/lib/tijar-native-app";
import { enMessages } from "@/lib/i18n/messages/en";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo/catalog";
import { absoluteSeoImage, seoHead } from "@/lib/seo/public-shop";
import { PRODUCTION_ORIGIN } from "@/lib/site-url";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && isTijarNativeApp()) {
      throw redirect({ to: "/shop" });
    }
  },
  head: () =>
    seoHead({
      title: enMessages.meta.home.title,
      description: enMessages.meta.home.description,
      url: PRODUCTION_ORIGIN,
      image: absoluteSeoImage("/tijar-logo.png"),
      keywords: "TIJAR, tijar.ng, buy Nigeria, Nigerian marketplace, local shops, informal market, order online Nigeria",
      jsonLd: [organizationJsonLd(), websiteJsonLd()],
    }),
  component: SocialLanding,
});
