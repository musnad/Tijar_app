import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { isTijarSuperAdminEmail } from "@/lib/admin";
import { supabaseServiceKey } from "@/lib/payments/shop-server";
import { readSupabasePublicEnv } from "@/lib/supabase/runtime-env";

export async function signedPlatformActor(
  request: Request,
  roles: Array<"admin" | "agent">,
): Promise<{ admin: SupabaseClient; profileId: string; email: string | null; roles: string[] } | { error: Response }> {
  const env = readSupabasePublicEnv();
  const service = supabaseServiceKey();
  if (!env || !service) {
    return { error: Response.json({ error: "Server is missing Supabase keys." }, { status: 503 }) };
  }
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return { error: Response.json({ error: "Sign in first." }, { status: 401 }) };
  }
  const userClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return { error: Response.json({ error: "Sign in first." }, { status: 401 }) };
  const admin = createClient(env.VITE_SUPABASE_URL, service);
  const { data: profile } = await admin.from("profiles").select("id, email").eq("auth_id", user.id).maybeSingle();
  if (!profile?.id) return { error: Response.json({ error: "Profile not found." }, { status: 403 }) };
  const email = (profile.email as string | null) ?? user.email ?? null;
  const { data: roleRows } = await admin.from("platform_roles").select("role").eq("profile_id", profile.id);
  const held = (roleRows ?? []).map((row) => String(row.role));
  const allowed =
    isTijarSuperAdminEmail(email) || roles.some((role) => held.includes(role) || (role === "admin" && held.includes("admin")));
  if (!allowed) return { error: Response.json({ error: "Not allowed." }, { status: 403 }) };
  return { admin, profileId: profile.id as string, email, roles: held };
}
