import { createFileRoute } from "@tanstack/react-router";

import { MarketplaceTermsDocument } from "@/features/legal/marketplace-terms";
import { enMessages } from "@/lib/i18n/messages/en";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: enMessages.meta.terms.title },
      { name: "description", content: enMessages.meta.terms.description },
      { property: "og:title", content: enMessages.meta.terms.ogTitle },
      { property: "og:description", content: enMessages.meta.terms.ogDescription },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MarketplaceTermsDocument,
});
