import { readActiveShopId } from "@/lib/active-business";
import { coordinatesForState, parseNigerianLocation } from "@/lib/nigeria-locations";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { OnboardingAnswers } from "@/features/onboarding/schemas";
import type { MemberRole } from "@/lib/business/capabilities";
import { isShopIdentityVerified } from "@/lib/kyc/bytid";
import { shopMayPostWithClient } from "@/lib/kyc/kyc-runtime";
import { isSlugAvailable } from "@/services/discover-service";
import type { Business, BusinessCategory, BusinessDna } from "@/types/database";
import { INFORMAL_BUSINESS_CATEGORIES } from "@/lib/informal-categories";
import { isValidSlug, slugifyBusinessName } from "@/utils/discover";

export async function listBusinessCategories(): Promise<{
  data: BusinessCategory[];
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("business_categories")
    .select("id, name, slug, sort_order")
    .eq("active", true)
    .order("sort_order");

  if (error) {
    return {
      data: INFORMAL_BUSINESS_CATEGORIES.map((c) => ({
        id: `local-${c.slug}`,
        name: c.name,
        slug: c.slug,
        sort_order: c.sort_order,
      })),
      error: null,
    };
  }
  const rows = (data ?? []) as BusinessCategory[];
  if (rows.length >= 8) return { data: rows, error: null };
  const have = new Set(rows.map((r) => r.slug));
  const extra = INFORMAL_BUSINESS_CATEGORIES.filter((c) => !have.has(c.slug)).map((c) => ({
    id: `local-${c.slug}`,
    name: c.name,
    slug: c.slug,
    sort_order: c.sort_order,
  }));
  return { data: [...rows, ...extra].sort((a, b) => a.sort_order - b.sort_order), error: null };
}

/**
 * Ensure the signed-in owner has a business_members row.
 * Product/stock RLS requires membership; businesses select also allows owner_id,
 * so users could open Add Product but inserts failed with RLS.
 */
export async function ensureOwnerMembership(
  businessId: string,
  profileId: string,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("business_members").upsert(
    {
      business_id: businessId,
      profile_id: profileId,
      role: "owner",
    },
    { onConflict: "business_id,profile_id", ignoreDuplicates: true },
  );
  if (!error) return { error: null };
  // Unique race / already member — fine.
  const m = error.message.toLowerCase();
  if (m.includes("duplicate") || m.includes("unique") || m.includes("already")) {
    return { error: null };
  }
  return { error: error.message };
}

export async function fetchPrimaryBusiness(profileId: string): Promise<{
  business: Business | null;
  dna: BusinessDna | null;
  canPost: boolean;
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  const { businesses, error: ownedError } = await fetchOwnedBusinesses(profileId);
  const preferred = readActiveShopId(profileId);
  const headquarters = businesses.filter((row) => !row.parent_business_id && row.owner_id === profileId);
  let business =
    businesses.find((row) => row.id === preferred) ??
    headquarters[0] ??
    businesses.find((row) => row.owner_id === profileId) ??
    businesses[0] ??
    null;

  if (ownedError && !business) {
    return { business: null, dna: null, canPost: false, error: ownedError };
  }

  if (!business) {
    return { business: null, dna: null, canPost: false, error: null };
  }

  // Best-effort heal so product/stock policies work for owners.
  await ensureOwnerMembership(business.id, profileId);

  const { data: dna, error: dnaError } = await supabase
    .from("business_dna")
    .select("*")
    .eq("business_id", business.id)
    .maybeSingle();

  const canPost = await shopMayPostWithClient(supabase, business.id, business);
  if (dnaError) {
    return { business, dna: null, canPost, error: dnaError.message };
  }

  return { business, dna: dna as BusinessDna | null, canPost, error: null };
}

export async function fetchOwnedBusinesses(profileId: string): Promise<{
  businesses: Business[];
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  const owned = await supabase.from("businesses").select("*").eq("owner_id", profileId).order("created_at");
  const map = new Map<string, Business>();
  for (const row of owned.data ?? []) {
    map.set(row.id as string, row as Business);
  }
  const memberships = await supabase.from("business_members").select("business_id").eq("profile_id", profileId);
  const missing = [...new Set((memberships.data ?? []).map((r) => r.business_id as string))].filter((id) => !map.has(id));
  if (missing.length > 0) {
    const extra = await supabase.from("businesses").select("*").in("id", missing);
    for (const row of extra.data ?? []) {
      map.set(row.id as string, row as Business);
    }
  }
  const businesses = [...map.values()];
  await Promise.all(businesses.map((b) => ensureOwnerMembership(b.id, profileId)));
  return { businesses, error: owned.error?.message ?? null };
}

export type UpdateBusinessProfileInput = {
  businessName: string;
  location: string;
  description?: string;
  categoryId?: string;
  islamicModeEnabled: boolean;
  logoUrl?: string | null;
  publicPhone?: string | null;
  publicWhatsapp?: string | null;
  publicSlug?: string | null;
  deliveryFee?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  publicLocationLabel?: string | null;
};

function geoPatch(input: UpdateBusinessProfileInput): Record<string, unknown> {
  const extras: Record<string, unknown> = {};
  if (input.latitude !== undefined && input.longitude !== undefined) {
    extras.latitude = input.latitude;
    extras.longitude = input.longitude;
  }
  if (input.publicLocationLabel !== undefined) {
    extras.public_location_label = input.publicLocationLabel?.trim() || null;
  }
  return extras;
}

export async function updateBusinessProfile(
  businessId: string,
  input: UpdateBusinessProfileInput,
  profileId?: string | null,
): Promise<{ business: Business | null; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  if (profileId) {
    await ensureOwnerMembership(businessId, profileId);
  }

  const name = input.businessName.trim();
  if (name.length < 2) {
    return { business: null, error: "Enter your business name." };
  }

  let nextSlug: string | undefined;
  if (input.publicSlug !== undefined) {
    nextSlug = slugifyBusinessName(input.publicSlug ?? "") || slugifyBusinessName(name);
    if (!isValidSlug(nextSlug)) {
      return { business: null, error: "Username needs at least 2 letters or numbers." };
    }
    const free = await isSlugAvailable(nextSlug, businessId);
    if (!free) {
      return { business: null, error: "That username is not available." };
    }
  }

  const clearLogo = input.logoUrl === null;
  const rpc = await supabase.rpc("save_business_profile", {
    p_business_id: businessId,
    p_business_name: name,
    p_location: input.location.trim(),
    p_description: input.description?.trim() ?? "",
    p_category_id: input.categoryId?.trim() ? input.categoryId : null,
    p_islamic_mode: input.islamicModeEnabled,
    p_logo_url: clearLogo ? null : (input.logoUrl ?? null),
    p_clear_logo: clearLogo,
    p_public_phone: input.publicPhone?.trim() ?? "",
    p_public_whatsapp: input.publicWhatsapp?.trim() ?? "",
  });
  if (!rpc.error && rpc.data) {
    const extras: Record<string, unknown> = { ...geoPatch(input) };
    if (nextSlug) extras.public_slug = nextSlug;
    if (input.deliveryFee != null && Number.isFinite(input.deliveryFee)) {
      extras.delivery_fee = Math.max(0, input.deliveryFee);
    }
    if (Object.keys(extras).length > 0) {
      const extra = await supabase.from("businesses").update(extras).eq("id", businessId).select("*").maybeSingle();
      if (!extra.error && extra.data) return { business: extra.data as Business, error: null };
    }
    return { business: rpc.data as Business, error: null };
  }

  const patch: Record<string, unknown> = {
    business_name: name,
    location: input.location.trim() || null,
    description: input.description?.trim() || null,
    islamic_mode_enabled: input.islamicModeEnabled,
    public_phone: input.publicPhone?.trim() || null,
    public_whatsapp: input.publicWhatsapp?.trim() || null,
    ...geoPatch(input),
  };
  if (input.categoryId?.trim()) patch.category_id = input.categoryId;
  if (input.logoUrl !== undefined) patch.logo_url = input.logoUrl;
  if (nextSlug) patch.public_slug = nextSlug;
  if (input.deliveryFee != null && Number.isFinite(input.deliveryFee)) {
    patch.delivery_fee = Math.max(0, input.deliveryFee);
  }

  const { data, error } = await supabase
    .from("businesses")
    .update(patch)
    .eq("id", businessId)
    .select("*")
    .maybeSingle();

  if (!error && data) {
    return { business: data as Business, error: null };
  }

  const message = error?.message ?? rpc.error?.message ?? "Could not save this shop.";
  if (/schema cache|column|does not exist|save_business_profile/i.test(message)) {
    return {
      business: null,
      error: "Shop edit is not set up on the database yet. Run migration 000034 in Supabase, then save again.",
    };
  }
  if (/not allowed|row-level security|permission/i.test(message)) {
    return { business: null, error: "Could not edit this shop. Sign in as the owner and try again." };
  }
  if (/duplicate|unique/i.test(message)) {
    return { business: null, error: "That username is not available." };
  }
  return { business: null, error: message };
}

export async function completeBusinessSetup(
  profileId: string,
  answers: OnboardingAnswers,
): Promise<{ businessId: string | null; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const islamicMode = answers.islamicMode === "yes";
  const primaryModel = answers.revenueModels[0] ?? "retail";

  const parsedPlace = parseNigerianLocation(answers.location);
  const coords = coordinatesForState(parsedPlace.state);
  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .insert({
      owner_id: profileId,
      business_name: answers.businessName.trim(),
      category_id: answers.categoryId,
      location: answers.location.trim(),
      public_location_label: answers.location.trim(),
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      islamic_mode_enabled: islamicMode,
      operating_mode: primaryModel,
      business_stage: "operating",
    })
    .select("id")
    .single();

  let businessId = business?.id as string | undefined;
  if (businessError || !businessId) {
    if (businessError && /column|schema cache|does not exist/i.test(businessError.message)) {
      const retry = await supabase
        .from("businesses")
        .insert({
          owner_id: profileId,
          business_name: answers.businessName.trim(),
          category_id: answers.categoryId,
          location: answers.location.trim(),
          islamic_mode_enabled: islamicMode,
          operating_mode: primaryModel,
          business_stage: "operating",
        })
        .select("id")
        .single();
      if (retry.error || !retry.data) {
        return { businessId: null, error: retry.error?.message ?? businessError.message };
      }
      businessId = retry.data.id as string;
    } else {
      return { businessId: null, error: businessError?.message ?? "Could not create business" };
    }
  }

  const { error: memberError } = await supabase.from("business_members").insert({
    business_id: businessId,
    profile_id: profileId,
    role: "owner",
  });

  if (memberError) {
    return { businessId: null, error: memberError.message };
  }

  const { error: dnaError } = await supabase.from("business_dna").insert({
    business_id: businessId,
    business_model: primaryModel,
    revenue_models: answers.revenueModels,
    customer_types: answers.customerTypes,
    payment_methods: answers.paymentMethods,
    customer_credit_enabled: answers.customerCredit,
    supplier_credit_enabled: answers.supplierCredit,
    inventory_required: answers.managesInventory,
    has_staff: answers.hasStaff,
    record_keeping_methods: answers.recordKeeping,
    discovery_channels: answers.discoveryChannels,
    goals: answers.goals,
  });

  if (dnaError) {
    return { businessId: null, error: dnaError.message };
  }

  await supabase.from("onboarding_sessions").insert({
    profile_id: profileId,
    business_id: businessId,
    current_step: "completed",
    answers,
    completed_at: new Date().toISOString(),
  });

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ onboarding_status: "completed" })
    .eq("id", profileId);

  if (profileError) {
    return { businessId, error: profileError.message };
  }

  await supabase.from("business_events").insert({
    business_id: businessId,
    event_type: "ONBOARDING_COMPLETED",
    payload: { islamic_mode: islamicMode },
  });

  return { businessId, error: null };
}

export type BusinessMemberRow = {
  id: string;
  business_id: string;
  profile_id: string;
  role: MemberRole;
  permissions: Record<string, boolean>;
  full_name?: string | null;
  email?: string | null;
};

export async function fetchMyMembership(
  businessId: string,
  profileId: string,
): Promise<{ role: MemberRole | null; permissions: Record<string, boolean> }> {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase
    .from("business_members")
    .select("role, permissions")
    .eq("business_id", businessId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!data) {
    const { data: owned } = await supabase
      .from("businesses")
      .select("id")
      .eq("id", businessId)
      .eq("owner_id", profileId)
      .maybeSingle();
    if (owned) return { role: "owner", permissions: {} };
    return { role: null, permissions: {} };
  }
  return {
    role: data.role as MemberRole,
    permissions: (data.permissions as Record<string, boolean>) ?? {},
  };
}

export async function fetchBusinessMembers(businessId: string): Promise<{
  members: BusinessMemberRow[];
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("business_members")
    .select("id, business_id, profile_id, role, permissions")
    .eq("business_id", businessId)
    .order("created_at");
  if (error) return { members: [], error: error.message };
  const rows = (data ?? []) as BusinessMemberRow[];
  const ids = rows.map((r) => r.profile_id);
  if (ids.length === 0) return { members: rows, error: null };
  const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
  const byId = new Map((profiles ?? []).map((p) => [p.id as string, p]));
  return {
    members: rows.map((r) => ({
      ...r,
      full_name: (byId.get(r.profile_id)?.full_name as string | null) ?? null,
      email: (byId.get(r.profile_id)?.email as string | null) ?? null,
    })),
    error: null,
  };
}

export async function kycRequest(body: Record<string, unknown>): Promise<{
  error: string | null;
  message?: string;
  url?: string;
  sessionId?: string;
  person?: Record<string, unknown>;
  record?: Record<string, unknown>;
}> {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return { error: "Sign in first." };
  const res = await fetch("/api/kyc/verify", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  let json: {
    error?: string;
    message?: string;
    url?: string;
    sessionId?: string;
    person?: Record<string, unknown>;
    record?: Record<string, unknown>;
  } = {};
  try {
    json = (await res.json()) as typeof json;
  } catch {
    json = { error: res.ok ? undefined : "Verification did not complete." };
  }
  if (!res.ok) return { error: json.error ?? "Verification failed." };
  return {
    error: null,
    message: json.message,
    url: json.url,
    sessionId: json.sessionId,
    person: json.person,
    record: json.record,
  };
}

export async function verifyShopCac(
  businessId: string,
  cacNumber: string,
): Promise<{ error: string | null; message?: string }> {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return { error: "Sign in first." };
  const res = await fetch("/api/kyc/verify", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "cac", businessId, cacNumber }),
  });
  let json: { error?: string; message?: string } = {};
  try {
    json = (await res.json()) as { error?: string; message?: string };
  } catch {
    json = { error: res.ok ? undefined : "CAC lookup did not complete." };
  }
  if (!res.ok) return { error: json.error ?? "CAC lookup failed." };
  return { error: null, message: json.message ?? "CAC saved." };
}

export async function submitKycForReview(
  businessId: string,
  input: { legalName: string; idType: string; idNumber: string; notes?: string },
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const summary = [
    `Legal name: ${input.legalName.trim()}`,
    `ID: ${input.idType.trim()} ${input.idNumber.trim()}`,
    input.notes?.trim() ? `Notes: ${input.notes.trim()}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const { error } = await supabase
    .from("businesses")
    .update({
      verification_status: "submitted",
      moderation_notes: summary.slice(0, 2000),
    })
    .eq("id", businessId);
  return { error: error?.message ?? null };
}

export type BadgeEligibility = {
  ok: boolean;
  nin_verified: boolean;
  account_days: number;
  min_account_days: number;
  post_count: number;
  min_posts: number;
  profile_complete: boolean;
  missing: string[];
  already_badged: boolean;
  pending: boolean;
  error?: string;
};

function parseEligibility(row: Record<string, unknown>): BadgeEligibility {
  const missing = Array.isArray(row.missing) ? row.missing.filter((x): x is string => typeof x === "string") : [];
  return {
    ok: Boolean(row.ok),
    nin_verified: Boolean(row.nin_verified),
    account_days: Number(row.account_days) || 0,
    min_account_days: Number(row.min_account_days) || 30,
    post_count: Number(row.post_count) || 0,
    min_posts: Number(row.min_posts) || 11,
    profile_complete: Boolean(row.profile_complete),
    missing,
    already_badged: Boolean(row.already_badged),
    pending: Boolean(row.pending),
    error: typeof row.error === "string" ? row.error : undefined,
  };
}

async function computeBadgeEligibility(businessId: string): Promise<BadgeEligibility | null> {
  const supabase = getSupabaseBrowserClient();
  const biz = await supabase.from("businesses").select("*").eq("id", businessId).maybeSingle();
  const business = biz.data as Business | null;
  if (!business) return null;
  const missing: string[] = [];
  const name = (business.business_name ?? "").trim();
  if (!name || ["tijar", "tijar shop"].includes(name.toLowerCase())) missing.push("shop name");
  if (!business.description?.trim()) missing.push("description");
  if (!business.public_slug?.trim()) missing.push("username");
  if (business.latitude == null || business.longitude == null) missing.push("map location");
  if (!business.public_phone?.trim() && !business.public_whatsapp?.trim()) missing.push("phone or WhatsApp");
  if (!business.logo_url?.trim()) missing.push("logo");
  const posts = await supabase
    .from("video_posts")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("status", "ready");
  const postCount = posts.count ?? 0;
  const created = business.created_at ? new Date(business.created_at).getTime() : Date.now();
  const accountDays = Math.max(0, Math.floor((Date.now() - created) / 86_400_000));
  const pendingReq = await supabase
    .from("verified_badge_requests")
    .select("id")
    .eq("business_id", businessId)
    .eq("status", "pending")
    .maybeSingle();
  const nin = isShopIdentityVerified(business);
  const complete = missing.length === 0;
  const pending = Boolean(pendingReq.data?.id);
  return {
    ok: nin && complete && accountDays >= 30 && postCount > 10 && !business.verified_badge && !pending,
    nin_verified: nin,
    account_days: accountDays,
    min_account_days: 30,
    post_count: postCount,
    min_posts: 11,
    profile_complete: complete,
    missing,
    already_badged: Boolean(business.verified_badge),
    pending,
  };
}

export async function fetchBadgeEligibility(businessId: string): Promise<{
  eligibility: BadgeEligibility | null;
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("verified_badge_eligibility", { p_business_id: businessId });
  if (!error && data && typeof data === "object") {
    return { eligibility: parseEligibility(data as Record<string, unknown>), error: null };
  }
  const fallback = await computeBadgeEligibility(businessId);
  if (fallback) return { eligibility: fallback, error: null };
  return { eligibility: null, error: error?.message ?? "Could not load eligibility." };
}

export async function requestVerifiedBadge(businessId: string): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("request_verified_badge", { p_business_id: businessId });
  return { error: error?.message ?? null };
}

export async function fetchVerifiedBadgeRequest(businessId: string): Promise<{
  status: "pending" | "approved" | "rejected" | null;
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("verified_badge_requests")
    .select("status")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { status: null, error: error.message };
  const status = data?.status;
  if (status === "pending" || status === "approved" || status === "rejected") return { status, error: null };
  return { status: null, error: null };
}

export async function inviteBusinessStaff(
  businessId: string,
  email: string,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("invite_business_staff", {
    p_business_id: businessId,
    p_email: email.trim(),
    p_permissions: {},
  });
  return { error: error?.message ?? null };
}
