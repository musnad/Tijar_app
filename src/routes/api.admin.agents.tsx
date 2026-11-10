import { createFileRoute } from "@tanstack/react-router";

import { readAgentId, shopsOnboardedByAgents } from "@/lib/agent-id";
import { signedPlatformActor } from "@/lib/platform-access";

export const Route = createFileRoute("/api/admin/agents")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ctx = await signedPlatformActor(request, ["admin"]);
        if ("error" in ctx) return ctx.error;
        const { data, error } = await ctx.admin
          .from("platform_roles")
          .select("profile_id, profiles(id, full_name, email, phone)")
          .eq("role", "agent");
        const roleRows =
          error
            ? ((await ctx.admin.from("platform_roles").select("profile_id").eq("role", "agent")).data ?? [])
            : (data ?? []);
        const profileIds = roleRows.map((row) => String(row.profile_id)).filter(Boolean);
        const shopsByAgent = await shopsOnboardedByAgents(ctx.admin, profileIds);
        const agents = await Promise.all(
          roleRows.map(async (row) => {
            const profile = "profiles" in row ? (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles) : null;
            const profileId = String(row.profile_id);
            return {
              profileId,
              agentId: await readAgentId(ctx.admin, profileId),
              fullName: (profile as { full_name?: string } | null)?.full_name ?? "",
              email: (profile as { email?: string } | null)?.email ?? "",
              phone: (profile as { phone?: string } | null)?.phone ?? "",
              shops: shopsByAgent.get(profileId) ?? [],
            };
          }),
        );
        agents.sort((a, b) => a.agentId.localeCompare(b.agentId));
        return Response.json({ agents });
      },
      POST: async ({ request }) => {
        const ctx = await signedPlatformActor(request, ["admin"]);
        if ("error" in ctx) return ctx.error;
        const body = (await request.json()) as { profileId?: string; on?: boolean };
        const profileId = body.profileId?.trim();
        if (!profileId) return Response.json({ error: "Pick a user." }, { status: 400 });
        const on = Boolean(body.on);
        const rpc = await ctx.admin.rpc("set_tijar_agent", { p_profile_id: profileId, p_on: on });
        if (rpc.error) {
          if (on) {
            const { error } = await ctx.admin.from("platform_roles").insert({ profile_id: profileId, role: "agent" });
            if (error && !/duplicate|unique/i.test(error.message)) {
              return Response.json({ error: "Run 000097, 000098 and 000099 in Supabase first.", detail: error.message }, { status: 400 });
            }
            await readAgentId(ctx.admin, profileId);
          } else {
            await ctx.admin.from("platform_roles").delete().eq("profile_id", profileId).eq("role", "agent");
          }
        }
        return Response.json({ ok: true, on, agentId: on ? await readAgentId(ctx.admin, profileId) : null });
      },
    },
  },
});
