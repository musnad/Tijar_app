import { createFileRoute } from "@tanstack/react-router";

import { PublicDirectoryScreen } from "@/features/seo/public-directory-screen";
import { breadcrumbJsonLd, itemListJsonLd, organizationJsonLd, websiteJsonLd } from "@/lib/seo/catalog";
import { fetchStateDirectory } from "@/lib/seo/location-directory";
import { placeSlug } from "@/lib/seo/location-taxonomy";
import { absoluteSeoImage, seoHead, shopPageUrl } from "@/lib/seo/public-shop";
import { PRODUCTION_ORIGIN } from "@/lib/site-url";

export const Route = createFileRoute("/nigeria/$state/")({
  loader: async ({ params }) => {
    try {
      return { directory: await fetchStateDirectory(params.state) };
    } catch {
      return { directory: null };
    }
  },
  head: ({ loaderData, params }) => {
    const directory = loaderData?.directory;
    const name = directory?.stateName ?? params.state;
    const indexable = Boolean(directory?.indexable);
    const url = `${PRODUCTION_ORIGIN}/nigeria/${encodeURIComponent(placeSlug(name) || params.state)}`;
    return seoHead({
      title: `Businesses in ${name} | Tijar.ng`,
      description: `Find local vendors, artisans and shops in ${name} on Tijar.`,
      url,
      image: absoluteSeoImage(directory?.shops[0]?.logo_url),
      noIndex: !indexable,
      jsonLd: [
        organizationJsonLd(),
        websiteJsonLd(),
        breadcrumbJsonLd([
          { name: "Tijar", url: PRODUCTION_ORIGIN },
          { name: "Nigeria", url: `${PRODUCTION_ORIGIN}/nigeria` },
          { name, url },
        ]),
        itemListJsonLd(
          `Businesses in ${name}`,
          url,
          (directory?.shops ?? []).map((shop) => ({ name: shop.business_name, url: shopPageUrl(shop.slug) })),
        ),
      ],
    });
  },
  component: Page,
});

function Page() {
  const { directory } = Route.useLoaderData();
  if (!directory) {
    return (
      <PublicDirectoryScreen
        title="Location not found"
        intro="That Nigerian state is not on Tijar yet."
        crumbs={[
          { label: "Tijar", href: "/shop" },
          { label: "Nigeria", href: "/nigeria" },
        ]}
        shops={[]}
        products={[]}
      />
    );
  }
  return (
    <PublicDirectoryScreen
      title={`Businesses in ${directory.stateName}`}
      intro={`Public Tijar vendors in ${directory.stateName}. Only places with real listings are shown.`}
      crumbs={[
        { label: "Tijar", href: "/shop" },
        { label: "Nigeria", href: "/nigeria" },
        { label: directory.stateName },
      ]}
      shops={directory.shops}
      products={[]}
      related={directory.topics}
    />
  );
}
