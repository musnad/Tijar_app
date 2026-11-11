import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { tijarShopEmail } from "@/lib/agent-email";
import { coordinatesForState, parseNigerianLocation } from "@/lib/nigeria-locations";
import { supabaseServiceKey } from "@/lib/payments/shop-server";
import { readSupabasePublicEnv } from "@/lib/supabase/runtime-env";
import { isValidSlug, slugifyBusinessName } from "@/utils/discover";
import type { UssdDraft } from "@/lib/ussd/menu";
import { normalizeUssdPhone, phoneLookupKeys } from "@/lib/ussd/phone";

function ussdAdmin(): SupabaseClient | null {
  const env = readSupabasePublicEnv();
  const service = supabaseServiceKey();
  if (!env || !service) return null;
  return createClient(env.VITE_SUPABASE_URL, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function newPassword(): string {
  return `Tijar${Math.floor(100000 + Math.random() * 900000)}`;
}

async function uniqueSlug(admin: SupabaseClient, name: string, phone: string): Promise<string> {
  const base = slugifyBusinessName(name) || "shop";
  const tail = phone.replace(/\D/g, "").slice(-4);
  const candidates = [base, `${base}-${tail}`, `${base}-${Date.now().toString(36).slice(-4)}`];
  for (const raw of candidates) {
    const slug = raw.replace(/^-+|-+$/g, "").slice(0, 40);
    if (!isValidSlug(slug)) continue;
    const [shop, profile] = await Promise.all([
      admin.from("businesses").select("id").eq("public_slug", slug).limit(1),
      admin.from("profiles").select("id").eq("email", tijarShopEmail(slug)).limit(1),
    ]);
    if (!shop.data?.length && !profile.data?.length) return slug;
  }
  return `shop-${Date.now().toString(36)}`;
}

export async function findShopByPhone(phone: string): Promise<string | null> {
  const admin = ussdAdmin();
  if (!admin || !phone.trim()) return null;
  try {
  const keys = phoneLookupKeys(phone);
  for (const key of keys) {
    let byShop = await admin
      .from("businesses")
      .select("public_slug")
      .eq("public_phone", key)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (byShop.error && /deleted_at/i.test(byShop.error.message)) {
      byShop = await admin.from("businesses").select("public_slug").eq("public_phone", key).limit(1).maybeSingle();
    }
    if (byShop.data?.public_slug) return `tijar.ng/b/${byShop.data.public_slug}`;
    const byProfile = await admin.from("profiles").select("id").eq("phone", key).limit(1).maybeSingle();
    if (byProfile.data?.id) {
      let owned = await admin
        .from("businesses")
        .select("public_slug")
        .eq("owner_id", byProfile.data.id)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (owned.error && /deleted_at/i.test(owned.error.message)) {
        owned = await admin
          .from("businesses")
          .select("public_slug")
          .eq("owner_id", byProfile.data.id)
          .limit(1)
          .maybeSingle();
      }
      if (owned.data?.public_slug) return `tijar.ng/b/${owned.data.public_slug}`;
    }
  }
  return null;
  } catch {
    return null;
  }
}

export async function createShopFromUssd(
  draft: UssdDraft,
  phoneRaw: string,
): Promise<{ ok: true; url: string; email: string; password: string } | { ok: false; error: string }> {
  const admin = ussdAdmin();
  if (!admin) return { ok: false, error: "Server is missing Supabase keys." };

  const phone = normalizeUssdPhone(phoneRaw);
  const slug = await uniqueSlug(admin, draft.shopName, phone);
  const loginEmail = tijarShopEmail(slug);
  const password = newPassword();

  const category = await admin.from("business_categories").select("id").eq("slug", draft.categorySlug).maybeSingle();

  let profileId: string | null = null;
  let authId: string | null = null;
  for (const key of phoneLookupKeys(phone)) {
    const existing = await admin.from("profiles").select("id, auth_id").eq("phone", key).maybeSingle();
    if (existing.data?.id) {
      profileId = existing.data.id as string;
      authId = (existing.data.auth_id as string | null) ?? null;
      break;
    }
  }

  if (!profileId) {
    const created = await admin.auth.admin.createUser({
      email: loginEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: draft.shopName,
        phone,
        account_mode: "business",
        signup_location: draft.location,
        tijar_login_email: loginEmail,
        tijar_login_password: password,
        opened_via: "ussd",
      },
    });
    if (created.error || !created.data.user) {
      return { ok: false, error: created.error?.message ?? "Could not create the login." };
    }
    authId = created.data.user.id;
    const wait = await admin.from("profiles").select("id").eq("auth_id", authId).maybeSingle();
    profileId = (wait.data?.id as string | undefined) ?? null;
    if (!profileId) {
      const inserted = await admin
        .from("profiles")
        .insert({
          auth_id: authId,
          email: loginEmail,
          full_name: draft.shopName,
          phone,
          account_mode: "business",
          active_mode: "business",
          onboarding_status: "completed",
          location_text: draft.location,
        })
        .select("id")
        .maybeSingle();
      profileId = (inserted.data?.id as string | undefined) ?? null;
    }
  } else {
    await admin
      .from("profiles")
      .update({
        full_name: draft.shopName,
        phone,
        account_mode: "business",
        active_mode: "business",
        onboarding_status: "completed",
        location_text: draft.location,
      })
      .eq("id", profileId);
    if (authId) {
      await admin.auth.admin.updateUserById(authId, {
        password,
        user_metadata: {
          tijar_login_email: loginEmail,
          tijar_login_password: password,
          opened_via: "ussd",
        },
      });
    }
  }

  if (!profileId) return { ok: false, error: "Profile was not created." };

  const parsed = parseNigerianLocation(draft.location);
  const fallback = coordinatesForState(parsed.state);
  const payload = {
    owner_id: profileId,
    business_name: draft.shopName,
    category_id: category.data?.id ?? null,
    custom_category: draft.categoryLabel,
    description: `Opened on USSD. ${draft.categoryLabel} in ${draft.location}`,
    location: draft.location,
    public_location_label: draft.location,
    location_approved: true,
    public_phone: phone,
    public_whatsapp: phone,
    public_slug: slug,
    is_published: true,
    moderation_status: "approved",
    is_informal: true,
    latitude: fallback?.lat ?? 9.0765,
    longitude: fallback?.lng ?? 7.3986,
    published_at: new Date().toISOString(),
    agent_login_password: password,
  };
  let shop = await admin.from("businesses").insert(payload).select("id").maybeSingle();
  if (shop.error && /agent_login_password/i.test(shop.error.message)) {
    const { agent_login_password: _pw, ...rest } = payload;
    shop = await admin.from("businesses").insert(rest).select("id").maybeSingle();
  }

  if (shop.error || !shop.data?.id) {
    return { ok: false, error: shop.error?.message ?? "Could not create the shop." };
  }

  await admin.from("business_members").upsert(
    { business_id: shop.data.id, profile_id: profileId, role: "owner" },
    { onConflict: "business_id,profile_id" },
  );

  return { ok: true, url: `tijar.ng/b/${slug}`, email: loginEmail, password };
}
