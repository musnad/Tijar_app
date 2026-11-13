import { createFileRoute } from "@tanstack/react-router";

import { PublicCatalogScreen } from "@/features/seo/public-catalog-screen";
import {
  fetchPublicCatalog,
  itemListJsonLd,
  organizationJsonLd,
  searchPageUrl,
  searchSeoDescription,
  searchSeoTitle,
  websiteJsonLd,
} from "@/lib/seo/catalog";
import { absoluteSeoImage, productPageUrl, seoHead, shopPageUrl } from "@/lib/seo/public-shop";

export const Route = createFileRoute("/shop/search/$query")({
  loader: async ({ params }) => {
    const query = decodeURIComponent(params.query).replace(/[-+]/g, " ").trim().slice(0, 80);
    try {
      const catalog = await fetchPublicCatalog({ query, limit: 60 });
      return { query, catalog };
    } catch {
      return { query, catalog: { products: [], shops: [], categories: [] } };
    }
  },
  head: ({ loaderData, params }) => {
    const query = loaderData?.query || decodeURIComponent(params.query);
    const products = loaderData?.catalog.products ?? [];
    return seoHead({
      title: searchSeoTitle(query),
      description: searchSeoDescription(query, products.length),
      url: searchPageUrl(query),
      image: absoluteSeoImage(products[0]?.image_url),
      keywords: `${query}, buy ${query}, ${query} Nigeria, ${query} price, TIJAR, tijar.ng`,
      jsonLd: [
        organizationJsonLd(),
        websiteJsonLd(),
        itemListJsonLd(
          `${query} on TIJAR`,
          searchPageUrl(query),
          [
            ...products.map((p) => ({ name: p.name, url: productPageUrl(p.id) })),
            ...(loaderData?.catalog.shops ?? []).map((s) => ({ name: s.business_name, url: shopPageUrl(s.slug) })),
          ],
        ),
      ],
    });
  },
  component: Page,
});

function Page() {
  const { query, catalog } = Route.useLoaderData();
  return (
    <PublicCatalogScreen
      title={`${query} on TIJAR`}
      intro={`Results for “${query}” from local Nigerian shops. Buy now on tijar.ng.`}
      products={catalog.products}
      shops={catalog.shops}
      categories={catalog.categories}
    />
  );
}
