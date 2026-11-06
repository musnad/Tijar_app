import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchFollowedBusinesses } from "@/services/marketplace-service";
import { openShopConversation, sendShopMessage } from "@/services/shop-chat-service";
import { fetchFollowersForMe, fetchPeopleIFollow } from "@/services/social-service";

export type DmPerson = {
  key: string;
  kind: "person" | "shop";
  name: string;
  avatarUrl: string | null;
  profileId: string | null;
  shopId: string | null;
};

export type DirectInboxRow = {
  id: string;
  otherId: string;
  otherName: string;
  otherAvatar: string | null;
  last_preview: string;
  last_message_at: string;
  unread: boolean;
};

function missingDm(message: string): boolean {
  return /direct_threads|direct_messages|open_direct_thread|schema cache|does not exist/i.test(message);
}

export async function fetchDmPeople(profileId: string): Promise<{ people: DmPerson[]; error: string | null }> {
  const [following, followers, shops] = await Promise.all([
    fetchPeopleIFollow(profileId),
    fetchFollowersForMe(profileId),
    fetchFollowedBusinesses(profileId),
  ]);
  const byKey = new Map<string, DmPerson>();
  for (const person of [...(following.people ?? []), ...(followers.people ?? [])]) {
    if (!person.profileId || person.profileId === profileId) continue;
    byKey.set(`person:${person.profileId}`, {
      key: `person:${person.profileId}`,
      kind: "person",
      name: person.name,
      avatarUrl: person.avatarUrl,
      profileId: person.profileId,
      shopId: person.shopId,
    });
  }
  for (const shop of shops.shops ?? []) {
    if (!shop.id) continue;
    byKey.set(`shop:${shop.id}`, {
      key: `shop:${shop.id}`,
      kind: "shop",
      name: shop.business_name || "Shop",
      avatarUrl: shop.logo_url ?? null,
      profileId: null,
      shopId: shop.id,
    });
  }
  return { people: [...byKey.values()], error: following.error ?? followers.error ?? shops.error };
}

export async function openDirectThread(otherProfileId: string): Promise<{ id: string | null; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("open_direct_thread", { p_other: otherProfileId });
  if (error) {
    if (missingDm(error.message)) {
      return { id: null, error: "Direct messages need migration 000071 in Supabase." };
    }
    return { id: null, error: error.message };
  }
  return { id: (data as string | null) ?? null, error: null };
}

export async function sendDirectMessage(input: {
  threadId: string;
  senderId: string;
  body: string;
}): Promise<{ error: string | null }> {
  const body = input.body.trim();
  if (!body) return { error: "Write a message first." };
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("direct_messages").insert({
    thread_id: input.threadId,
    sender_id: input.senderId,
    body,
  });
  if (error) {
    if (missingDm(error.message)) return { error: "Direct messages need migration 000071 in Supabase." };
    return { error: error.message };
  }
  return { error: null };
}

export async function sendPostToRecipients(input: {
  profileId: string;
  recipients: DmPerson[];
  title: string;
  url: string;
}): Promise<{ sent: number; error: string | null }> {
  const body = `Check this on TIJAR: ${input.title}\n${input.url}`.slice(0, 2000);
  let sent = 0;
  let lastError: string | null = null;
  for (const person of input.recipients) {
    if (person.kind === "shop" && person.shopId) {
      const chat = await openShopConversation({
        customerId: input.profileId,
        businessId: person.shopId,
      });
      if (chat.error || !chat.id) {
        lastError = chat.error;
        continue;
      }
      const msg = await sendShopMessage({ conversationId: chat.id, senderId: input.profileId, body });
      if (msg.error) lastError = msg.error;
      else sent += 1;
      continue;
    }
    if (!person.profileId) continue;
    const thread = await openDirectThread(person.profileId);
    if (thread.error || !thread.id) {
      if (person.shopId) {
        const chat = await openShopConversation({
          customerId: input.profileId,
          businessId: person.shopId,
        });
        if (chat.id) {
          const msg = await sendShopMessage({ conversationId: chat.id, senderId: input.profileId, body });
          if (!msg.error) sent += 1;
          else lastError = msg.error;
          continue;
        }
      }
      lastError = thread.error;
      continue;
    }
    const msg = await sendDirectMessage({ threadId: thread.id, senderId: input.profileId, body });
    if (msg.error) lastError = msg.error;
    else sent += 1;
  }
  if (sent === 0) return { sent: 0, error: lastError ?? "Could not send." };
  return { sent, error: null };
}

export async function fetchDirectInbox(profileId: string): Promise<{ rows: DirectInboxRow[]; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("direct_threads")
    .select("id, user_a, user_b, last_preview, last_message_at, a_last_read_at, b_last_read_at")
    .or(`user_a.eq.${profileId},user_b.eq.${profileId}`)
    .order("last_message_at", { ascending: false })
    .limit(80);
  if (error) {
    if (missingDm(error.message)) return { rows: [], error: null };
    return { rows: [], error: error.message };
  }
  const others = [...new Set((data ?? []).map((row) => ((row.user_a as string) === profileId ? (row.user_b as string) : (row.user_a as string))))];
  const names = new Map<string, { full_name?: string | null; avatar_url?: string | null }>();
  if (others.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", others);
    for (const p of profiles ?? []) names.set(p.id as string, p);
  }
  return {
    rows: (data ?? []).map((row) => {
      const otherId = (row.user_a as string) === profileId ? (row.user_b as string) : (row.user_a as string);
      const person = names.get(otherId);
      const isA = (row.user_a as string) === profileId;
      const readAt = isA ? row.a_last_read_at : row.b_last_read_at;
      const last = new Date(String(row.last_message_at)).getTime();
      const unread = !readAt || new Date(String(readAt)).getTime() < last;
      return {
        id: `dm:${row.id as string}`,
        otherId,
        otherName: (person?.full_name as string | null)?.trim() || "Shopper",
        otherAvatar: (person?.avatar_url as string | null) ?? null,
        last_preview: (row.last_preview as string) || "",
        last_message_at: row.last_message_at as string,
        unread,
      };
    }),
    error: null,
  };
}

export async function fetchDirectMessages(
  threadId: string,
  profileId: string,
): Promise<{
  messages: Array<{ id: string; sender_id: string; body: string; created_at: string }>;
  otherName: string;
  otherAvatar: string | null;
  error: string | null;
}> {
  const id = threadId.replace(/^dm:/, "");
  const supabase = getSupabaseBrowserClient();
  const { data: thread, error: tErr } = await supabase
    .from("direct_threads")
    .select("id, user_a, user_b")
    .eq("id", id)
    .maybeSingle();
  if (tErr) {
    if (missingDm(tErr.message)) return { messages: [], otherName: "Chat", otherAvatar: null, error: "Direct messages need migration 000071 in Supabase." };
    return { messages: [], otherName: "Chat", otherAvatar: null, error: tErr.message };
  }
  if (!thread) return { messages: [], otherName: "Chat", otherAvatar: null, error: "Chat not found." };
  const otherId = (thread.user_a as string) === profileId ? (thread.user_b as string) : (thread.user_a as string);
  const [{ data: msgs, error: mErr }, { data: person }] = await Promise.all([
    supabase.from("direct_messages").select("id, sender_id, body, created_at").eq("thread_id", id).order("created_at", { ascending: true }).limit(200),
    supabase.from("profiles").select("full_name, avatar_url").eq("id", otherId).maybeSingle(),
  ]);
  if (mErr) return { messages: [], otherName: "Chat", otherAvatar: null, error: mErr.message };
  const isA = (thread.user_a as string) === profileId;
  await supabase
    .from("direct_threads")
    .update(isA ? { a_last_read_at: new Date().toISOString() } : { b_last_read_at: new Date().toISOString() })
    .eq("id", id);
  return {
    messages: (msgs ?? []).map((m) => ({
      id: m.id as string,
      sender_id: m.sender_id as string,
      body: m.body as string,
      created_at: m.created_at as string,
    })),
    otherName: (person?.full_name as string | null)?.trim() || "Shopper",
    otherAvatar: (person?.avatar_url as string | null) ?? null,
    error: null,
  };
}
