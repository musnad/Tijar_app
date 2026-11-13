import { createFileRoute } from "@tanstack/react-router";

import { collectSitemapPaths } from "@/lib/seo/catalog";
import { buildSitemapXml } from "@/lib/seo/public-shop";

async function sitemapResponse() {
  const paths = await collectSitemapPaths();
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
