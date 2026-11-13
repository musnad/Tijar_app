import { createFileRoute } from "@tanstack/react-router";

import { PublicCatalogScreen } from "@/features/seo/public-catalog-screen";
import {
  categoryPageUrl,
  categorySeoDescription,
  categorySeoTitle,
  categorySlug,
  fetchPublicCatalog,
  itemListJsonLd,
  organizationJsonLd,
  resolveCategoryName,
  websiteJsonLd,
} from "@/lib/seo/catalog";
import { absoluteSeoImage, productPageUrl, seoHead, shopPageUrl } from "@/lib/seo/public-shop";

export const Route = createFileRoute("/shop/c/$category")({
  loader: async ({ params }) => {
    try {
      const name = await resolveCategoryName(params.category);
      const catalog = await fetchPublicCatalog({ category: name ?? params.category, limit: 60 });
      return { name: name ?? params.category.replace(/-/g, " "), catalog };
    } catch {
      return { name: params.category.replace(/-/g, " "), catalog: { products: [], shops: [], categories: [] } };
    }
  },
  head: ({ loaderData, params }) => {
    const name = loaderData?.name ?? params.category;
    const products = loaderData?.catalog.products ?? [];
    return seoHead({
      title: categorySeoTitle(name),
      description: categorySeoDescription(name, products.length),
      url: categoryPageUrl(name),
      image: absoluteSeoImage(products[0]?.image_url),
      keywords: `${name}, buy ${name} Nigeria, ${name} price, TIJAR marketplace, tijar.ng`,
      jsonLd: [
        organizationJsonLd(),
        websiteJsonLd(),
        itemListJsonLd(
          `${name} on TIJAR`,
          categoryPageUrl(name),
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
  const { name, catalog } = Route.useLoaderData();
  return (
    <PublicCatalogScreen
      title={`Buy ${name} on TIJAR`}
      intro={`Local ${name.toLowerCase()} from Nigerian shops. Compare prices and order on tijar.ng.`}
      products={catalog.products}
      shops={catalog.shops}
      categories={catalog.categories.filter((c) => categorySlug(c) !== categorySlug(name))}
    />
  );
}
