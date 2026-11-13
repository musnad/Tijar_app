import { createFileRoute } from "@tanstack/react-router";

import { ShopDiscoverScreen } from "@/features/marketplace/shop-discover-screen";
import {
  fetchPublicCatalog,
  itemListJsonLd,
  organizationJsonLd,
  searchSeoDescription,
  searchSeoTitle,
  websiteJsonLd,
} from "@/lib/seo/catalog";
import { absoluteSeoImage, productPageUrl, seoHead, shopPageUrl } from "@/lib/seo/public-shop";
import { PRODUCTION_ORIGIN } from "@/lib/site-url";

type DiscoverSearch = { q?: string; c?: string };

export const Route = createFileRoute("/shop/discover")({
  validateSearch: (s: Record<string, unknown>): DiscoverSearch => ({
    q: typeof s.q === "string" && s.q.trim() ? s.q.trim().slice(0, 80) : undefined,
    c: typeof s.c === "string" && s.c.trim() ? s.c.trim().slice(0, 80) : undefined,
  }),
  loader: async ({ search }) => {
    const catalog = await fetchPublicCatalog({ query: search.q, category: search.c, limit: 48 });
    return { ...catalog, q: search.q, c: search.c };
  },
  head: ({ loaderData }) => {
    const q = loaderData?.q;
    const c = loaderData?.c;
    const products = loaderData?.products ?? [];
    const title = q ? searchSeoTitle(q) : c ? `Buy ${c} in Nigeria | TIJAR` : "Explore products and shops — TIJAR";
    const description = q
      ? searchSeoDescription(q, products.length)
      : c
        ? `Shop ${c} from local Nigerian businesses on TIJAR. Order on tijar.ng.`
        : "Search products, services and local shops on TIJAR. Buy from Nigerian sellers on tijar.ng.";
    const path = q ? `/shop/discover?q=${encodeURIComponent(q)}` : c ? `/shop/discover?c=${encodeURIComponent(c)}` : "/shop/discover";
    return seoHead({
      title,
      description,
      url: `${PRODUCTION_ORIGIN}${path}`,
      image: absoluteSeoImage(products[0]?.image_url),
      keywords: [q, c, "buy Nigeria", "marketplace", "TIJAR", "tijar.ng"].filter(Boolean).join(", "),
      jsonLd: [
        organizationJsonLd(),
        websiteJsonLd(),
        itemListJsonLd(
          title,
          `${PRODUCTION_ORIGIN}${path}`,
          [
            ...products.map((p) => ({ name: p.name, url: productPageUrl(p.id) })),
            ...(loaderData?.shops ?? []).map((s) => ({ name: s.business_name, url: shopPageUrl(s.slug) })),
          ],
        ),
      ],
    });
  },
  component: Page,
});

function Page() {
  const { q, c } = Route.useSearch();
  const catalog = Route.useLoaderData();
  return <ShopDiscoverScreen initialQuery={q} initialCategory={c} initialProducts={catalog.products} />;
}
