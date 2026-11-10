import { createFileRoute } from "@tanstack/react-router";

import { applyAgentShopEdit, rotateDueGalleryPosts } from "@/lib/agent-visibility";
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
        const edits = await ctx.admin
          .from("agent_edit_requests")
          .select("id, business_id, agent_profile_id, payload, status, created_at")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(80);
        return Response.json({ agents, edits: edits.data ?? [] });
      },
      POST: async ({ request }) => {
        const ctx = await signedPlatformActor(request, ["admin"]);
        if ("error" in ctx) return ctx.error;
        const body = (await request.json()) as {
          action?: string;
          profileId?: string;
          on?: boolean;
          businessId?: string;
          postId?: string;
          editId?: string;
        };
        if (body.action === "delete-business") {
          const businessId = body.businessId?.trim();
          if (!businessId) return Response.json({ error: "Pick a shop." }, { status: 400 });
          const rpc = await ctx.admin.rpc("admin_delete_business", { p_business_id: businessId });
          if (rpc.error) {
            await ctx.admin
              .from("businesses")
              .update({ is_published: false, moderation_status: "suspended" })
              .eq("id", businessId);
          }
          return Response.json({ ok: true });
        }
        if (body.action === "delete-post") {
          const postId = body.postId?.trim();
          if (!postId) return Response.json({ error: "Pick a post." }, { status: 400 });
          const rpc = await ctx.admin.rpc("delete_video_post", { p_post_id: postId });
          if (rpc.error) {
            await ctx.admin.from("video_posts").update({ status: "archived" }).eq("id", postId);
          }
          return Response.json({ ok: true });
        }
        if (body.action === "approve-edit" || body.action === "reject-edit") {
          const editId = body.editId?.trim();
          if (!editId) return Response.json({ error: "Pick an edit." }, { status: 400 });
          const { data: edit } = await ctx.admin.from("agent_edit_requests").select("*").eq("id", editId).maybeSingle();
          if (!edit) return Response.json({ error: "Edit not found." }, { status: 404 });
          if (body.action === "approve-edit") {
            const payload = (edit.payload ?? {}) as {
              businessName?: string;
              phone?: string;
              location?: string;
              password?: string;
              category?: string;
            };
            await applyAgentShopEdit(ctx.admin, String(edit.business_id), {
              businessName: String(payload.businessName ?? ""),
              phone: String(payload.phone ?? ""),
              location: String(payload.location ?? ""),
              password: String(payload.password ?? ""),
              category: String(payload.category ?? ""),
            });
          }
          await ctx.admin
            .from("agent_edit_requests")
            .update({
              status: body.action === "approve-edit" ? "approved" : "rejected",
              admin_profile_id: ctx.profileId,
              reviewed_at: new Date().toISOString(),
            })
            .eq("id", editId);
          return Response.json({ ok: true });
        }
        if (body.action === "repost-now") {
          const posted = await rotateDueGalleryPosts(ctx.admin);
          return Response.json({ ok: true, posted });
        }
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
