import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";

import { tijarShopEmail } from "@/lib/agent-email";
import { readAgentId } from "@/lib/agent-id";
import { attachShopLogins, createAgentCatalogue, parseAgentOffers, readShopLogin, saveShopLogin } from "@/lib/agent-visibility";
import { isTijarSuperAdminEmail } from "@/lib/admin";
import { coordinatesForState, parseNigerianLocation } from "@/lib/nigeria-locations";
import { signedPlatformActor } from "@/lib/platform-access";
import { isValidSlug, slugifyBusinessName } from "@/utils/discover";

function requestQuery(request: Request, key: string): string {
  const header = request.headers.get(`x-tijar-${key}`)?.trim() ?? "";
  if (header) return header;
  try {
    return new URL(request.url, "https://www.tijar.ng").searchParams.get(key)?.trim() ?? "";
  } catch {
    return "";
  }
}

function firstId(rows: unknown): string | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const id = (rows[0] as { id?: unknown } | undefined)?.id;
  return typeof id === "string" && id ? id : null;
}

async function loginTaken(admin: SupabaseClient, slug: string): Promise<string | null> {
  const email = tijarShopEmail(slug).toLowerCase();
  const [slugHit, emailHit] = await Promise.all([
    admin.from("businesses").select("id").eq("public_slug", slug).limit(1),
    admin.from("profiles").select("id").eq("email", email).limit(1),
  ]);
  if (firstId(slugHit.data)) return "That username is already taken.";
  if (firstId(emailHit.data)) return `${email} is already taken.`;
  return null;
}

async function uploadPublic(admin: SupabaseClient, bucket: string, path: string, file: File): Promise<string | null> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error } = await admin.storage.from(bucket).upload(path, bytes, {
    upsert: true,
    contentType: file.type || "image/jpeg",
  });
  if (error) return null;
  const { data } = admin.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl ?? null;
}

export const Route = createFileRoute("/api/agent/shops")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ctx = await signedPlatformActor(request, ["admin", "agent"]);
        if ("error" in ctx) return ctx.error;
        const shopId = requestQuery(request, "shopId");
        if (shopId) {
          const isAdmin = ctx.roles.includes("admin") || isTijarSuperAdminEmail(ctx.email);
          const shopRes = await ctx.admin
            .from("businesses")
            .select(
              "id, business_name, public_slug, public_phone, public_location_label, logo_url, custom_category, created_at, created_by_agent_id, owner_id, description",
            )
            .eq("id", shopId)
            .maybeSingle();
          const shop = shopRes.data;
          if (shopRes.error || !shop) return Response.json({ error: shopRes.error?.message ?? "Shop not found." }, { status: 404 });
          const extra = await ctx.admin.from("businesses").select("gallery_urls").eq("id", shopId).maybeSingle();
          if (!isAdmin && shop.created_by_agent_id !== ctx.profileId) {
            return Response.json({ error: "Not your shop." }, { status: 403 });
          }
          const login = await readShopLogin(ctx.admin, { businessId: shopId, ownerId: shop.owner_id as string });
          const products = await ctx.admin
            .from("products")
            .select("id, name, kind, sale_price, image_url, is_published")
            .eq("business_id", shopId)
            .limit(40);
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
              gallery: (extra.data?.gallery_urls as string[] | undefined) ?? [],
              createdAt: shop.created_at,
            },
            products: products.data ?? [],
          });
        }
        const checkName = requestQuery(request, "username");
        if (checkName) {
          const slug = slugifyBusinessName(checkName);
          const email = tijarShopEmail(slug);
          if (!isValidSlug(slug)) {
            return Response.json({
              available: false,
              username: slug,
              email,
              error: "Use letters or numbers, at least 2 characters.",
            });
          }
          const taken = await loginTaken(ctx.admin, slug);
          return Response.json({
            available: !taken,
            username: slug,
            email,
            error: taken,
          });
        }
        const isAdmin = ctx.roles.includes("admin") || isTijarSuperAdminEmail(ctx.email);
        const query = ctx.admin
          .from("businesses")
          .select("id, business_name, public_slug, public_phone, public_location_label, logo_url, created_at, custom_category, owner_id, created_by_agent_id, agent_login_password")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(200);
        let { data, error } = isAdmin
          ? await query.not("created_by_agent_id", "is", null)
          : await query.eq("created_by_agent_id", ctx.profileId);
        if (error && /deleted_at|agent_login_password/i.test(error.message)) {
          const fallback = ctx.admin
            .from("businesses")
            .select("id, business_name, public_slug, public_phone, public_location_label, logo_url, created_at, custom_category, owner_id, created_by_agent_id")
            .order("created_at", { ascending: false })
            .limit(200);
          const retry = isAdmin
            ? await fallback.not("created_by_agent_id", "is", null)
            : await fallback.eq("created_by_agent_id", ctx.profileId);
          data = retry.data;
          error = retry.error;
        }
        if (error) {
          return Response.json({
            shops: [],
            error: "Run 000098 in Supabase so agent shops can be stored.",
            detail: error.message,
          });
        }
        const rows = (data ?? []) as Array<Record<string, unknown>>;
        const logins = await attachShopLogins(
          ctx.admin,
          rows.map((row) => ({ id: String(row.id), owner_id: (row.owner_id as string | null) ?? null })),
        );
        return Response.json({
          shops: rows.map((row) => {
            const login = logins.get(String(row.id));
            return {
              ...row,
              login_email: login?.email ?? "",
              login_password: login?.password ?? "",
            };
          }),
          agentId: await readAgentId(ctx.admin, ctx.profileId),
        });
      },
      POST: async ({ request }) => {
        const ctx = await signedPlatformActor(request, ["admin", "agent"]);
        if ("error" in ctx) return ctx.error;
        const form = await request.formData();
        const businessName = String(form.get("businessName") ?? "").trim();
        const usernameRaw = String(form.get("username") ?? "").trim();
        const password = String(form.get("password") ?? "");
        const phone = String(form.get("phone") ?? "").trim();
        const location = String(form.get("location") ?? "").trim();
        const categoryId = String(form.get("categoryId") ?? "").trim();
        const customCategory = String(form.get("customCategory") ?? "").trim();
        const latIn = Number(form.get("lat"));
        const lngIn = Number(form.get("lng"));
        if (businessName.length < 2) return Response.json({ error: "Enter the business name." }, { status: 400 });
        if (password.length < 8) return Response.json({ error: "Password must be at least 8 characters." }, { status: 400 });
        if (phone.replace(/\D/g, "").length < 7) return Response.json({ error: "Enter a phone number customers can call." }, { status: 400 });
        if (!location) return Response.json({ error: "Enter the business location." }, { status: 400 });

        const slug = slugifyBusinessName(usernameRaw);
        if (!isValidSlug(slug)) {
          return Response.json({ error: "Type a username so we can make their login email." }, { status: 400 });
        }
        const taken = await loginTaken(ctx.admin, slug);
        if (taken) return Response.json({ error: taken }, { status: 409 });
        const loginEmail = tijarShopEmail(slug);

        const created = await ctx.admin.auth.admin.createUser({
          email: loginEmail,
          password,
          email_confirm: true,
          user_metadata: {
            full_name: businessName,
            phone,
            account_mode: "business",
            signup_location: location,
            tijar_login_email: loginEmail,
            tijar_login_password: password,
          },
        });
        if (created.error || !created.data.user) {
          return Response.json({ error: created.error?.message ?? "Could not create the login." }, { status: 400 });
        }

        let { data: profile } = await ctx.admin
          .from("profiles")
          .select("id")
          .eq("auth_id", created.data.user.id)
          .maybeSingle();
        if (!profile?.id) {
          const inserted = await ctx.admin
            .from("profiles")
            .insert({
              auth_id: created.data.user.id,
              email: loginEmail,
              full_name: businessName,
              phone,
              account_mode: "business",
              active_mode: "business",
              onboarding_status: "completed",
              location_text: location,
            })
            .select("id")
            .maybeSingle();
          profile = inserted.data;
        } else {
          await ctx.admin
            .from("profiles")
            .update({
              full_name: businessName,
              phone,
              account_mode: "business",
              active_mode: "business",
              onboarding_status: "completed",
              location_text: location,
            })
            .eq("id", profile.id);
        }
        if (!profile?.id) return Response.json({ error: "Profile was not created." }, { status: 500 });

        let resolvedCategory = categoryId.startsWith("local-") ? "" : categoryId;
        const other = !resolvedCategory || customCategory || /other/i.test(categoryId);
        if (other && customCategory) {
          const catSlug = slugifyBusinessName(customCategory) || "custom";
          const existing = await ctx.admin.from("business_categories").select("id").eq("slug", catSlug).maybeSingle();
          if (existing.data?.id) resolvedCategory = existing.data.id as string;
          else {
            const made = await ctx.admin
              .from("business_categories")
              .insert({ name: customCategory, slug: catSlug, sort_order: 980, active: true })
              .select("id")
              .maybeSingle();
            if (made.data?.id) resolvedCategory = made.data.id as string;
          }
        }

        const parsed = parseNigerianLocation(location);
        const fallback = coordinatesForState(parsed.state);
        const latitude = Number.isFinite(latIn) ? latIn : fallback?.lat ?? null;
        const longitude = Number.isFinite(lngIn) ? lngIn : fallback?.lng ?? null;

        const shop = await ctx.admin
          .from("businesses")
          .insert({
            owner_id: profile.id,
            business_name: businessName,
            category_id: resolvedCategory || null,
            custom_category: customCategory || null,
            description: customCategory ? `${customCategory} in ${location}` : location,
            location,
            public_location_label: location,
            location_approved: true,
            public_phone: phone,
            public_whatsapp: phone,
            public_slug: slug,
            is_published: true,
            moderation_status: "approved",
            is_informal: true,
            latitude,
            longitude,
            created_by_agent_id: ctx.profileId,
            published_at: new Date().toISOString(),
          })
          .select("id")
          .maybeSingle();
        if (shop.error || !shop.data?.id) {
          return Response.json({ error: shop.error?.message ?? "Could not create the shop." }, { status: 400 });
        }
        const businessId = shop.data.id as string;
        await ctx.admin.from("business_members").upsert(
          { business_id: businessId, profile_id: profile.id, role: "owner" },
          { onConflict: "business_id,profile_id" },
        );

        const logo = form.get("logo");
        const galleryFiles = form.getAll("photos").filter((item): item is File => item instanceof File && item.size > 0 && item.type.startsWith("image/")).slice(0, 10);
        let logoUrl: string | null = null;
        if (logo instanceof File && logo.size > 0) {
          logoUrl = await uploadPublic(ctx.admin, "business-logos", `${businessId}/logo.jpg`, logo);
        }
        const gallery: string[] = [];
        for (let i = 0; i < galleryFiles.length; i += 1) {
          const url = await uploadPublic(ctx.admin, "business-logos", `${businessId}/gallery-${i + 1}.jpg`, galleryFiles[i]!);
          if (url) gallery.push(url);
        }
        await ctx.admin
          .from("businesses")
          .update({
            logo_url: logoUrl,
            cover_image_url: gallery[0] ?? logoUrl,
            gallery_urls: gallery,
          })
          .eq("id", businessId);

        await saveShopLogin(ctx.admin, {
          businessId,
          agentProfileId: ctx.profileId,
          ownerAuthId: created.data.user.id,
          email: loginEmail,
          password,
        });

        await createAgentCatalogue(ctx.admin, {
          businessId,
          ownerProfileId: profile.id,
          businessName,
          location,
          gallery,
          offers: parseAgentOffers(String(form.get("offers") ?? "[]")),
        });

        return Response.json({
          ok: true,
          shop: {
            id: businessId,
            businessName,
            username: slug,
            email: loginEmail,
            phone,
            location,
          },
        });
      },
    },
  },
});
