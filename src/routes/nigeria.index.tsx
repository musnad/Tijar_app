import { createFileRoute } from "@tanstack/react-router";

import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { breadcrumbJsonLd, organizationJsonLd, websiteJsonLd } from "@/lib/seo/catalog";
import { fetchNigeriaHub } from "@/lib/seo/location-directory";
import { absoluteSeoImage, seoHead } from "@/lib/seo/public-shop";
import { PRODUCTION_ORIGIN } from "@/lib/site-url";

export const Route = createFileRoute("/nigeria/")({
  loader: async () => {
    try {
      return { states: await fetchNigeriaHub() };
    } catch {
      return { states: [] };
    }
  },
  head: ({ loaderData }) => {
    const states = loaderData?.states ?? [];
    const indexable = states.length > 0;
    return seoHead({
      title: "Local businesses in Nigeria | Tijar.ng",
      description: "Discover informal businesses, artisans and traders across Nigerian states on Tijar.",
      url: `${PRODUCTION_ORIGIN}/nigeria`,
      image: absoluteSeoImage("/tijar-logo.png"),
      noIndex: !indexable,
      jsonLd: [
        organizationJsonLd(),
        websiteJsonLd(),
        breadcrumbJsonLd([
          { name: "Tijar", url: PRODUCTION_ORIGIN },
          { name: "Nigeria", url: `${PRODUCTION_ORIGIN}/nigeria` },
        ]),
      ],
    });
  },
  component: Page,
});

function Page() {
  const { states } = Route.useLoaderData();
  return (
    <MarketplaceShell hideTopBar variant="feed">
      <div className="min-h-0 flex-1 overflow-y-auto bg-white px-4 pb-10 pt-[max(0.7rem,env(safe-area-inset-top))]">
        <p className="text-[11px] font-extrabold tracking-[0.2em] text-[#1F7A4D]">TIJAR</p>
        <h1 className="mt-2 text-[26px] font-extrabold text-[#0B1F4D]">Local businesses in Nigeria</h1>
        <p className="mt-2 text-[14px] text-[#4B5563]">States with public Tijar vendors. Empty states are not listed.</p>
        <ul className="mt-4 grid gap-2">
          {states.map((row) => (
            <li key={row.slug}>
              <a href={`/nigeria/${row.slug}`} className="flex min-h-12 items-center justify-between rounded-2xl border border-border px-3">
                <span className="font-extrabold text-[#0B1F4D]">{row.state}</span>
                <span className="text-[12px] text-muted-foreground">{row.count} shops</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </MarketplaceShell>
  );
}
