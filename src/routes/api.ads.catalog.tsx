import { createFileRoute } from "@tanstack/react-router";

import { signedPlatformActor } from "@/lib/platform-access";

export const Route = createFileRoute("/api/ads/catalog")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ctx = await signedPlatformActor(request, ["admin"]);
        if ("error" in ctx) return ctx.error;
        const shopId = new URL(request.url).searchParams.get("shopId")?.trim() || "";

        const shops = await ctx.admin
          .from("businesses")
          .select("id, business_name, logo_url, is_published, public_slug")
          .order("business_name")
          .limit(800);

        let products: Array<{ id: string; name: string; image_url: string | null; sale_price: number | null }> = [];
        let posts: Array<{ id: string; caption: string | null; cover: string | null }> = [];

        if (shopId) {
          const productRows = await ctx.admin
            .from("products")
            .select("id, name, image_url, sale_price, is_active")
            .eq("business_id", shopId)
            .order("name")
            .limit(200);
          products = (productRows.data ?? []).map((row) => ({
            id: String(row.id),
            name: String(row.name ?? "Product"),
            image_url: (row.image_url as string | null) ?? null,
            sale_price: row.sale_price == null ? null : Number(row.sale_price),
          }));

          const postRows = await ctx.admin
            .from("video_posts")
            .select("id, caption, cover_path, playback_url, image_urls, created_at")
            .eq("business_id", shopId)
            .order("created_at", { ascending: false })
            .limit(80);
          posts = (postRows.data ?? []).map((row) => {
            const images = Array.isArray(row.image_urls) ? (row.image_urls as string[]) : [];
            return {
              id: String(row.id),
              caption: (row.caption as string | null) ?? null,
              cover: (row.cover_path as string | null) || images[0] || (row.playback_url as string | null) || null,
            };
          });
        }

        return Response.json({
          shops: (shops.data ?? []).map((row) => ({
            id: String(row.id),
            name: String(row.business_name ?? "Shop"),
            logo: (row.logo_url as string | null) ?? null,
            published: Boolean(row.is_published),
            slug: (row.public_slug as string | null) ?? null,
          })),
          products,
          posts,
        });
      },
    },
  },
});
