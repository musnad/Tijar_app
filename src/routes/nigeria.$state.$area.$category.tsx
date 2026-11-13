import { createFileRoute } from "@tanstack/react-router";

import { PublicDirectoryScreen } from "@/features/seo/public-directory-screen";
import { breadcrumbJsonLd, itemListJsonLd, organizationJsonLd, websiteJsonLd } from "@/lib/seo/catalog";
import {
  findKeyword,
  locationPageDescription,
  locationPageTitle,
} from "@/lib/seo/keywords";
import { fetchLocationDirectory, nigeriaPageUrl, nigeriaPath } from "@/lib/seo/location-directory";
import { placeSlug } from "@/lib/seo/location-taxonomy";
import { absoluteSeoImage, productPageUrl, seoHead, shopPageUrl } from "@/lib/seo/public-shop";
import { PRODUCTION_ORIGIN } from "@/lib/site-url";

export const Route = createFileRoute("/nigeria/$state/$area/$category")({
  validateSearch: (search: Record<string, unknown>) => ({
    page: Number(search.page) > 1 ? Number(search.page) : 1,
  }),
  loader: async ({ params, search }) => {
    const page = Number(search?.page) > 1 ? Number(search.page) : 1;
    try {
      const directory = await fetchLocationDirectory({
        stateSlug: params.state,
        categorySlug: params.category,
        areaSlug: params.area,
        page,
      });
      return { directory };
    } catch {
      return { directory: null };
    }
  },
  head: ({ loaderData, params }) => {
    const directory = loaderData?.directory;
    const keyword = directory?.keyword ?? findKeyword(params.category);
    const place = directory?.placeLabel ?? `${params.area}, ${params.state}`;
    const title = keyword ? locationPageTitle(keyword, place) : `${params.category.replace(/-/g, " ")} in ${place} | Tijar.ng`;
    const description = keyword
      ? locationPageDescription(keyword, place, directory?.totalShops ?? 0)
      : `Local businesses in ${place} on Tijar.`;
    const url = nigeriaPageUrl(params.state, params.category, params.area);
    const indexable = Boolean(directory?.indexable);
    return seoHead({
      title,
      description,
      url,
      image: absoluteSeoImage(directory?.shops[0]?.cover_image_url || directory?.shops[0]?.logo_url),
      noIndex: !indexable,
      jsonLd: [
        organizationJsonLd(),
        websiteJsonLd(),
        breadcrumbJsonLd([
          { name: "Tijar", url: PRODUCTION_ORIGIN },
          { name: "Nigeria", url: `${PRODUCTION_ORIGIN}/nigeria` },
          { name: directory?.stateName ?? params.state, url: `${PRODUCTION_ORIGIN}/nigeria/${encodeURIComponent(params.state)}` },
          { name: directory?.areaName ?? params.area, url: `${PRODUCTION_ORIGIN}/nigeria/${encodeURIComponent(params.state)}/${encodeURIComponent(params.area)}/${encodeURIComponent(params.category)}` },
        ]),
        itemListJsonLd(
          title,
          url,
          [
            ...(directory?.shops ?? []).map((shop) => ({ name: shop.business_name, url: shopPageUrl(shop.slug) })),
            ...(directory?.products ?? []).map((product) => ({ name: product.name, url: productPageUrl(product.id) })),
          ],
        ),
      ],
    });
  },
  component: Page,
});

function Page() {
  const { state, area, category } = Route.useParams();
  const page = Route.useSearch()?.page ?? 1;
  const directory = Route.useLoaderData()?.directory;
  const keyword = directory?.keyword ?? findKeyword(category);
  const place = directory?.placeLabel ?? `${area}, ${state}`;
  const heading = keyword ? `${keyword.heading} in ${place}` : `${category.replace(/-/g, " ")} in ${place}`;
  return (
    <PublicDirectoryScreen
      title={heading}
      intro={keyword ? locationPageDescription(keyword, place, directory?.totalShops ?? 0) : "Public Tijar vendors for this neighbourhood."}
      crumbs={[
        { label: "Tijar", href: "/shop" },
        { label: "Nigeria", href: "/nigeria" },
        { label: directory?.stateName ?? state, href: `/nigeria/${placeSlug(directory?.stateName ?? state)}` },
        { label: directory?.areaName ?? area },
        { label: keyword?.heading ?? category },
      ]}
      shops={directory?.shops ?? []}
      products={directory?.products ?? []}
      related={directory?.related}
      page={page}
      pageSize={directory?.pageSize}
      total={directory?.totalShops}
      pageHref={(next) => `${nigeriaPath(state, category, area)}${next > 1 ? `?page=${next}` : ""}`}
    />
  );
}
