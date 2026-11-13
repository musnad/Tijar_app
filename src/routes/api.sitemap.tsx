import { createFileRoute } from "@tanstack/react-router";

import { buildSitemapXml, listPublicProductIds, listPublicShopSlugs } from "@/lib/seo/public-shop";

async function sitemapResponse() {
  const [slugs, productIds] = await Promise.all([listPublicShopSlugs(), listPublicProductIds()]);
  const paths = [
    "/",
    "/discover",
    "/about",
    "/how-it-works",
    "/learn",
    "/shop/discover",
    ...slugs.map((slug) => `/b/${encodeURIComponent(slug)}`),
    ...productIds.map((id) => `/shop/p/${encodeURIComponent(id)}`),
  ];
  return new Response(buildSitemapXml(paths), {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}

export const Route = createFileRoute("/api/sitemap")({
  server: {
    handlers: {
      GET: sitemapResponse,
    },
  },
});
