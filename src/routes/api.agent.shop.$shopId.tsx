import { createFileRoute } from "@tanstack/react-router";

import { applyAgentShopEdit } from "@/lib/agent-visibility";
import { signedPlatformActor } from "@/lib/platform-access";

export const Route = createFileRoute("/api/agent/shop/$shopId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const ctx = await signedPlatformActor(request, ["admin", "agent"]);
        if ("error" in ctx) return ctx.error;
        const shopId = params.shopId;
        const { data: shop, error } = await ctx.admin
          .from("businesses")
          .select(
            "id, business_name, public_slug, public_phone, public_location_label, logo_url, gallery_urls, custom_category, created_at, created_by_agent_id, owner_id, description, deleted_at",
          )
          .eq("id", shopId)
          .maybeSingle();
        if (error || !shop) return Response.json({ error: "Shop not found." }, { status: 404 });
        const isAdmin = ctx.roles.includes("admin");
        if (!isAdmin && shop.created_by_agent_id !== ctx.profileId) {
          return Response.json({ error: "Not your shop." }, { status: 403 });
        }
        const secret = await ctx.admin
          .from("agent_shop_secrets")
          .select("login_email, login_password")
          .eq("business_id", shopId)
          .maybeSingle();
        const owner = await ctx.admin.from("profiles").select("email, phone").eq("id", shop.owner_id).maybeSingle();
        const products = await ctx.admin
          .from("products")
          .select("id, name, kind, sale_price, image_url, extra_image_urls, is_published")
          .eq("business_id", shopId)
          .order("created_at", { ascending: false });
        const edits = await ctx.admin
          .from("agent_edit_requests")
          .select("id, payload, status, created_at, reviewed_at")
          .eq("business_id", shopId)
          .order("created_at", { ascending: false })
          .limit(10);
        return Response.json({
          shop: {
            id: shop.id,
            businessName: shop.business_name,
            username: shop.public_slug,
            email: secret.data?.login_email || owner.data?.email || "",
            password: secret.data?.login_password || "",
            phone: shop.public_phone,
            location: shop.public_location_label,
            category: shop.custom_category,
            description: shop.description,
            logoUrl: shop.logo_url,
            gallery: shop.gallery_urls ?? [],
            createdAt: shop.created_at,
            deleted: Boolean(shop.deleted_at),
          },
          products: products.data ?? [],
          edits: edits.data ?? [],
        });
      },
      POST: async ({ request, params }) => {
        const ctx = await signedPlatformActor(request, ["admin", "agent"]);
        if ("error" in ctx) return ctx.error;
        const shopId = params.shopId;
        const { data: shop } = await ctx.admin
          .from("businesses")
          .select("id, created_by_agent_id")
          .eq("id", shopId)
          .maybeSingle();
        if (!shop) return Response.json({ error: "Shop not found." }, { status: 404 });
        if (shop.created_by_agent_id !== ctx.profileId && !ctx.roles.includes("admin")) {
          return Response.json({ error: "Not your shop." }, { status: 403 });
        }
        const body = (await request.json().catch(() => ({}))) as {
          businessName?: string;
          phone?: string;
          location?: string;
          password?: string;
          category?: string;
        };
        const payload = {
          businessName: String(body.businessName ?? "").trim(),
          phone: String(body.phone ?? "").trim(),
          location: String(body.location ?? "").trim(),
          password: String(body.password ?? "").trim(),
          category: String(body.category ?? "").trim(),
        };
        if (payload.businessName.length < 2) return Response.json({ error: "Enter the business name." }, { status: 400 });
        if (ctx.roles.includes("admin")) {
          await applyAgentShopEdit(ctx.admin, shopId, payload);
          return Response.json({ ok: true, applied: true });
        }
        const { error } = await ctx.admin.from("agent_edit_requests").insert({
          business_id: shopId,
          agent_profile_id: ctx.profileId,
          payload,
          status: "pending",
        });
        if (error) {
          return Response.json(
            { error: "Run 000100 in Supabase so agent edits can be saved.", detail: error.message },
            { status: 400 },
          );
        }
        return Response.json({ ok: true, applied: false });
      },
    },
  },
});
