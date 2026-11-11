import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";

import { tijarShopEmail } from "@/lib/agent-email";
import { attachShopLogins, createAgentCatalogue, parseAgentOffers, readShopLogin, saveShopLogin } from "@/lib/agent-visibility";
import { coordinatesForState, parseNigerianLocation } from "@/lib/nigeria-locations";
import { signedShopUser } from "@/lib/platform-access";
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

async function ownedHeadquarters(admin: SupabaseClient, profileId: string) {
  let query = await admin
    .from("businesses")
    .select("id, business_name, public_slug, logo_url, parent_business_id")
    .eq("owner_id", profileId)
    .order("created_at", { ascending: true });
  if (query.error && /parent_business_id/i.test(query.error.message)) {
    query = await admin
      .from("businesses")
      .select("id, business_name, public_slug, logo_url")
      .eq("owner_id", profileId)
      .order("created_at", { ascending: true });
  }
  const rows = (query.data ?? []) as Array<Record<string, unknown>>;
  return rows.filter((row) => !row.parent_business_id);
}

async function canMonitor(admin: SupabaseClient, profileId: string, shopId: string): Promise<boolean> {
  const shop = await admin.from("businesses").select("id, owner_id, parent_business_id").eq("id", shopId).maybeSingle();
  if (!shop.data) return false;
  if (shop.data.owner_id === profileId) return true;
  const member = await admin
    .from("business_members")
    .select("business_id")
    .eq("business_id", shopId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (member.data) return true;
  const parentId = shop.data.parent_business_id as string | null;
  if (!parentId) return false;
  const parent = await admin.from("businesses").select("owner_id").eq("id", parentId).maybeSingle();
  return parent.data?.owner_id === profileId;
}

export const Route = createFileRoute("/api/shop/branches")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ctx = await signedShopUser(request);
        if ("error" in ctx) return ctx.error;
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

        const shopId = requestQuery(request, "shopId");
        if (shopId) {
          if (!(await canMonitor(ctx.admin, ctx.profileId, shopId))) {
            return Response.json({ error: "Not your shop." }, { status: 403 });
          }
          const shopRes = await ctx.admin
            .from("businesses")
            .select(
              "id, business_name, public_slug, public_phone, public_location_label, logo_url, custom_category, created_at, owner_id, description, parent_business_id",
            )
            .eq("id", shopId)
            .maybeSingle();
          const shop = shopRes.data;
          if (shopRes.error || !shop) {
            return Response.json({ error: shopRes.error?.message ?? "Shop not found." }, { status: 404 });
          }
          const extra = await ctx.admin.from("businesses").select("gallery_urls").eq("id", shopId).maybeSingle();
          const login = await readShopLogin(ctx.admin, { businessId: shopId, ownerId: shop.owner_id as string, agentProfileId: ctx.profileId });
          let products = await ctx.admin.from("products").select("id, name, kind, sale_price, image_url, is_published").eq("business_id", shopId).limit(40);
          if (products.error) {
            products = await ctx.admin.from("products").select("id, name, sale_price").eq("business_id", shopId).limit(40);
          }
          let posts = await ctx.admin
            .from("video_posts")
            .select("id, caption, playback_url, cover_path, created_at, like_count, status")
            .eq("business_id", shopId)
            .order("created_at", { ascending: false })
            .limit(30);
          if (posts.error) {
            posts = await ctx.admin
              .from("video_posts")
              .select("id, caption, created_at")
              .eq("business_id", shopId)
              .order("created_at", { ascending: false })
              .limit(30);
          }
          const txs = await ctx.admin
            .from("transactions")
            .select("id, type, amount, occurred_at, description, payment_method")
            .eq("business_id", shopId)
            .order("occurred_at", { ascending: false })
            .limit(40);
          const orders = await ctx.admin
            .from("orders")
            .select("id, status, created_at")
            .eq("business_id", shopId)
            .order("created_at", { ascending: false })
            .limit(20);
          const sales = (txs.data ?? []).filter((row) => row.type === "sale").reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
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
              parentBusinessId: shop.parent_business_id,
            },
            products: products.data ?? [],
            posts: posts.data ?? [],
            transactions: txs.data ?? [],
            orders: orders.data ?? [],
            stats: {
              products: products.data?.length ?? 0,
              posts: posts.data?.length ?? 0,
              sales,
              orders: orders.data?.length ?? 0,
            },
          });
        }

        const hq = await ownedHeadquarters(ctx.admin, ctx.profileId);
        const hqIds = hq.map((row) => String(row.id));
        let branches: Array<Record<string, unknown>> = [];
        if (hqIds.length > 0) {
          let listed = await ctx.admin
            .from("businesses")
            .select(
              "id, business_name, public_slug, public_phone, public_location_label, logo_url, created_at, custom_category, owner_id, parent_business_id, agent_login_password",
            )
            .in("parent_business_id", hqIds)
            .order("created_at", { ascending: false })
            .limit(200);
          if (listed.error && /parent_business_id|agent_login_password/i.test(listed.error.message)) {
            const members = await ctx.admin.from("business_members").select("business_id").eq("profile_id", ctx.profileId);
            const ids = [...new Set((members.data ?? []).map((row) => String(row.business_id)))].filter((id) => !hqIds.includes(id));
            if (ids.length > 0) {
              listed = await ctx.admin
                .from("businesses")
                .select("id, business_name, public_slug, public_phone, public_location_label, logo_url, created_at, custom_category, owner_id")
                .in("id", ids)
                .order("created_at", { ascending: false });
            } else {
              listed = { data: [], error: null } as typeof listed;
            }
          }
          branches = (listed.data ?? []) as Array<Record<string, unknown>>;
        }

        const logins = await attachShopLogins(
          ctx.admin,
          branches.map((row) => ({ id: String(row.id), owner_id: (row.owner_id as string | null) ?? null })),
        );
        return Response.json({
          headquarters: hq,
          shops: branches.map((row) => {
            const login = logins.get(String(row.id));
            return {
              ...row,
              login_email: login?.email ?? "",
              login_password: login?.password ?? "",
            };
          }),
        });
      },
      POST: async ({ request }) => {
        const ctx = await signedShopUser(request);
        if ("error" in ctx) return ctx.error;
        const hq = await ownedHeadquarters(ctx.admin, ctx.profileId);
        if (hq.length === 0) {
          return Response.json({ error: "Create your main business first, then add branch shops." }, { status: 400 });
        }
        const form = await request.formData();
        const parentId = String(form.get("parentBusinessId") ?? "").trim() || String(hq[0]!.id);
        if (!hq.some((row) => String(row.id) === parentId)) {
          return Response.json({ error: "You can only add a branch under your own shop." }, { status: 403 });
        }
        const businessName = String(form.get("businessName") ?? "").trim();
        const usernameRaw = String(form.get("username") ?? "").trim();
        const password = String(form.get("password") ?? "");
        const phone = String(form.get("phone") ?? "").trim();
        const location = String(form.get("location") ?? "").trim();
        const categoryId = String(form.get("categoryId") ?? "").trim();
        const customCategory = String(form.get("customCategory") ?? "").trim();
        const latIn = Number(form.get("lat"));
        const lngIn = Number(form.get("lng"));
        if (businessName.length < 2) return Response.json({ error: "Enter the branch name." }, { status: 400 });
        if (password.length < 8) return Response.json({ error: "Password must be at least 8 characters." }, { status: 400 });
        if (phone.replace(/\D/g, "").length < 7) return Response.json({ error: "Enter a phone number customers can call." }, { status: 400 });
        if (!location) return Response.json({ error: "Enter the branch location." }, { status: 400 });

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
        const latitude = Number.isFinite(latIn) ? latIn : fallback?.lat ?? 9.0765;
        const longitude = Number.isFinite(lngIn) ? lngIn : fallback?.lng ?? 7.3986;

        const payload: Record<string, unknown> = {
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
          parent_business_id: parentId,
          published_at: new Date().toISOString(),
        };
        let shop = await ctx.admin.from("businesses").insert(payload).select("id").maybeSingle();
        if (shop.error && /parent_business_id/i.test(shop.error.message)) {
          delete payload.parent_business_id;
          shop = await ctx.admin.from("businesses").insert(payload).select("id").maybeSingle();
        }
        if (shop.error || !shop.data?.id) {
          return Response.json({ error: shop.error?.message ?? "Could not create the branch." }, { status: 400 });
        }
        const businessId = shop.data.id as string;
        await ctx.admin.from("business_members").upsert(
          { business_id: businessId, profile_id: profile.id, role: "owner" },
          { onConflict: "business_id,profile_id" },
        );
        await ctx.admin.from("business_members").upsert(
          { business_id: businessId, profile_id: ctx.profileId, role: "owner" },
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
            password,
          },
        });
      },
    },
  },
});
