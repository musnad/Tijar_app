import type { SupabaseClient } from "@supabase/supabase-js";

export function fallbackAgentId(profileId: string): string {
  return `TJ-AG-${profileId.replace(/-/g, "").slice(-8).toUpperCase()}`;
}

export async function readAgentId(admin: SupabaseClient, profileId: string): Promise<string> {
  const existing = await admin.from("agent_ids").select("agent_id").eq("profile_id", profileId).maybeSingle();
  if (existing.data?.agent_id) return String(existing.data.agent_id);
  const rpc = await admin.rpc("ensure_agent_id", { p_profile_id: profileId });
  if (typeof rpc.data === "string" && rpc.data.trim()) return rpc.data.trim();
  return fallbackAgentId(profileId);
}

export type AgentOnboardedShop = {
  id: string;
  businessName: string;
  username: string;
  email: string;
  phone: string;
  location: string;
  category: string;
  logoUrl: string;
  createdAt: string;
};

export async function shopsOnboardedByAgents(
  admin: SupabaseClient,
  agentProfileIds?: string[],
): Promise<Map<string, AgentOnboardedShop[]>> {
  let query = admin
    .from("businesses")
    .select(
      "id, business_name, public_slug, public_phone, public_location_label, logo_url, custom_category, created_at, created_by_agent_id, owner_id",
    )
    .not("created_by_agent_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (agentProfileIds && agentProfileIds.length > 0) {
    query = query.in("created_by_agent_id", agentProfileIds);
  }
  const { data: shops } = await query;
  const ownerIds = [...new Set((shops ?? []).map((row) => String(row.owner_id ?? "")).filter(Boolean))];
  const emails = new Map<string, string>();
  if (ownerIds.length > 0) {
    const { data: profiles } = await admin.from("profiles").select("id, email").in("id", ownerIds);
    for (const profile of profiles ?? []) {
      emails.set(String(profile.id), String(profile.email ?? ""));
    }
  }
  const grouped = new Map<string, AgentOnboardedShop[]>();
  for (const row of shops ?? []) {
    const agentId = String(row.created_by_agent_id ?? "");
    if (!agentId) continue;
    const shop: AgentOnboardedShop = {
      id: String(row.id),
      businessName: String(row.business_name ?? ""),
      username: String(row.public_slug ?? ""),
      email: emails.get(String(row.owner_id ?? "")) || "",
      phone: String(row.public_phone ?? ""),
      location: String(row.public_location_label ?? ""),
      category: String(row.custom_category ?? ""),
      logoUrl: String(row.logo_url ?? ""),
      createdAt: String(row.created_at ?? ""),
    };
    const list = grouped.get(agentId) ?? [];
    list.push(shop);
    grouped.set(agentId, list);
  }
  return grouped;
}
