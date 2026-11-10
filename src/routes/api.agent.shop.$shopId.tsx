import { createFileRoute } from "@tanstack/react-router";

import { isTijarSuperAdminEmail } from "@/lib/admin";
import { applyAgentShopEdit, readShopLogin } from "@/lib/agent-visibility";
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
            "id, business_name, public_slug, public_phone, public_location_label, logo_url, custom_category, created_at, created_by_agent_id, owner_id, description",
          )
          .eq("id", shopId)
          .maybeSingle();
        if (error || !shop) return Response.json({ error: error?.message ?? "Shop not found." }, { status: 404 });
        const isAdmin = ctx.roles.includes("admin") || isTijarSuperAdminEmail(ctx.email);
        if (!isAdmin && shop.created_by_agent_id !== ctx.profileId) {
          return Response.json({ error: "Not your shop." }, { status: 403 });
        }
        const login = await readShopLogin(ctx.admin, { businessId: shopId, ownerId: shop.owner_id as string });
        const extra = await ctx.admin.from("businesses").select("gallery_urls").eq("id", shopId).maybeSingle();
        const products = await ctx.admin
          .from("products")
          .select("id, name, kind, sale_price, image_url, is_published")
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
            email: login.email,
            password: login.password,
            phone: shop.public_phone,
            location: shop.public_location_label,
            category: shop.custom_category,
            description: shop.description,
            logoUrl: shop.logo_url,
            gallery: extra.data?.gallery_urls ?? [],
            createdAt: shop.created_at,
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
