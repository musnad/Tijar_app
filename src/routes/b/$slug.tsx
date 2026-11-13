import { createFileRoute } from "@tanstack/react-router";

import { StorefrontScreen } from "@/features/discover/storefront-screen";

export const Route = createFileRoute("/b/$slug")({
  head: () => ({
    meta: [
      { title: "Shop on TIJAR" },
      { name: "description", content: "View this local business on TIJAR: products, services, opening hours and contact options." },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "Shop on TIJAR" },
      { property: "og:description", content: "Open this shop on tijar.ng" },
      { property: "og:image", content: "https://www.tijar.ng/tijar-logo.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://www.tijar.ng/tijar-logo.png" },
    ],
  }),
  component: Page,
});

function Page() {
  const { slug } = Route.useParams();
  return <StorefrontScreen slug={slug} />;
}
