import { createFileRoute, redirect } from "@tanstack/react-router";

import { enMessages } from "@/lib/i18n/messages/en";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: enMessages.meta.siteName },
      { name: "description", content: enMessages.meta.home.description },
      { property: "og:title", content: enMessages.meta.home.ogTitle },
      { property: "og:description", content: enMessages.meta.home.ogDescription },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "/tijar-logo.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "/tijar-logo.png" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/shop" });
  },
});
