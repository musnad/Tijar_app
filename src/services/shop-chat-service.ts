import { isMockFeedId } from "@/features/marketplace/feed-mock";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type ShopChatRole = "customer" | "business";

export type ShopChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  role: ShopChatRole;
};

export type ShopInboxRow = {
  id: string;
  business_id: string;
  customer_id: string;
  last_preview: string;
  last_message_at: string;
  business_name: string;
  logo_url: string | null;
  business_slug: string | null;
  customer_name: string;
  as_seller: boolean;
  unread: boolean;
};

function missingTable(message: string): boolean {
  return /does not exist|schema cache|shop_conversations|shop_messages/i.test(message);
}

export async function openShopConversation(input: {
  customerId: string;
  businessId: string;
  businessName?: string | null;
  logoUrl?: string | null;
  businessSlug?: string | null;
  productId?: string | null;
}): Promise<{ id: string | null; error: string | null }> {
  if (isMockFeedId(input.businessId)) {
    return { id: null, error: "This shop is not available." };
  }

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("open_shop_conversation", {
    p_business_id: input.businessId,
    p_product_id: input.productId ?? null,
  });
  if (error) {
    if (missingTable(error.message)) {
      return {
        id: null,
        error: "Chat is not set up yet. Apply migration 000026 in Supabase.",
      };
    }
    return { id: null, error: error.message };
  }
  return { id: (data as string | null) ?? null, error: null };
}

export async function fetchShopInbox(
  profileId: string,
  myBusinessIds: string[],
): Promise<{ rows: ShopInboxRow[]; error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { data: asCustomer, error: cErr } = await supabase
    .from("shop_conversations")
    .select(
      "id, business_id, customer_id, last_preview, last_message_at, customer_last_read_at, business_last_read_at, businesses ( business_name, logo_url, public_slug )",
    )
    .eq("customer_id", profileId)
    .order("last_message_at", { ascending: false })
    .limit(80);

  if (cErr && missingTable(cErr.message)) {
    return { rows: [], error: "Chat is not set up yet. Apply migration 000026 in Supabase." };
  }
  if (cErr) return { rows: [], error: cErr.message };

  let asSeller: typeof asCustomer = [];
  if (myBusinessIds.length > 0) {
    const r = await supabase
      .from("shop_conversations")
      .select(
        "id, business_id, customer_id, last_preview, last_message_at, customer_last_read_at, business_last_read_at, businesses ( business_name, logo_url, public_slug ), profiles:customer_id ( full_name )",
      )
      .in("business_id", myBusinessIds)
      .order("last_message_at", { ascending: false })
      .limit(80);
    if (!r.error) asSeller = r.data ?? [];
  }

  const live: ShopInboxRow[] = [];
  const seen = new Set<string>();
  for (const row of [...(asSeller ?? []), ...(asCustomer ?? [])]) {
    const id = row.id as string;
    if (seen.has(id)) continue;
    seen.add(id);
    const biz = row.businesses as { business_name?: string; logo_url?: string | null; public_slug?: string | null } | null;
    const profile = (row as { profiles?: { full_name?: string | null } | null }).profiles;
    const asSellerRow = myBusinessIds.includes(row.business_id as string);
    const last = new Date(String(row.last_message_at)).getTime();
    const readAt = asSellerRow ? row.business_last_read_at : row.customer_last_read_at;
    const unread = !readAt || new Date(String(readAt)).getTime() < last;
    live.push({
      id,
      business_id: row.business_id as string,
      customer_id: row.customer_id as string,
      last_preview: (row.last_preview as string) || "",
      last_message_at: row.last_message_at as string,
      business_name: biz?.business_name ?? "Shop",
      logo_url: biz?.logo_url ?? null,
      business_slug: biz?.public_slug ?? null,
      customer_name: profile?.full_name ?? "Customer",
      as_seller: asSellerRow,
      unread,
    });
  }

  live.sort((a, b) => +new Date(b.last_message_at) - +new Date(a.last_message_at));
  return { rows: live, error: null };
}

export async function countUnreadShopChats(profileId: string, myBusinessIds: string[]): Promise<number> {
  const { rows } = await fetchShopInbox(profileId, myBusinessIds);
  return rows.filter((r) => r.unread).length;
}

export async function fetchShopMessages(
  conversationId: string,
  customerId: string,
): Promise<{ messages: ShopChatMessage[]; inbox: ShopInboxRow | null; error: string | null }> {
  if (isMockFeedId(conversationId) || conversationId.startsWith("mock-chat-")) {
    return { messages: [], inbox: null, error: "This chat is not available." };
  }

  const supabase = getSupabaseBrowserClient();
  const { data: convo, error: cErr } = await supabase
    .from("shop_conversations")
    .select(
      "id, business_id, customer_id, last_preview, last_message_at, customer_last_read_at, business_last_read_at, businesses ( business_name, logo_url, public_slug )",
    )
    .eq("id", conversationId)
    .maybeSingle();
  if (cErr) {
    if (missingTable(cErr.message)) return { messages: [], inbox: null, error: "Chat is not set up yet. Apply migration 000026 in Supabase." };
    return { messages: [], inbox: null, error: cErr.message };
  }
  if (!convo) return { messages: [], inbox: null, error: "Chat not found." };

  const { data: msgs, error: mErr } = await supabase
    .from("shop_messages")
    .select("id, conversation_id, sender_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (mErr) return { messages: [], inbox: null, error: mErr.message };

  const biz = convo.businesses as { business_name?: string; logo_url?: string | null; public_slug?: string | null } | null;
  const inbox: ShopInboxRow = {
    id: convo.id as string,
    business_id: convo.business_id as string,
    customer_id: convo.customer_id as string,
    last_preview: (convo.last_preview as string) || "",
    last_message_at: convo.last_message_at as string,
    business_name: biz?.business_name ?? "Shop",
    logo_url: biz?.logo_url ?? null,
    business_slug: biz?.public_slug ?? null,
    customer_name: "Customer",
    as_seller: convo.customer_id !== customerId,
    unread: false,
  };

  const messages: ShopChatMessage[] = (msgs ?? []).map((m) => ({
    id: m.id as string,
    conversation_id: m.conversation_id as string,
    sender_id: m.sender_id as string,
    body: m.body as string,
    created_at: m.created_at as string,
    role: m.sender_id === convo.customer_id ? "customer" : "business",
  }));

  const asSeller = inbox.as_seller;
  await supabase
    .from("shop_conversations")
    .update(asSeller ? { business_last_read_at: new Date().toISOString() } : { customer_last_read_at: new Date().toISOString() })
    .eq("id", conversationId);

  return { messages, inbox, error: null };
}

export async function sendShopMessage(input: {
  conversationId: string;
  senderId: string;
  body: string;
  asSeller?: boolean;
}): Promise<{ error: string | null }> {
  const body = input.body.trim();
  if (!body) return { error: "Write a message first." };
  if (body.length > 2000) return { error: "Message is too long." };

  if (isMockFeedId(input.conversationId) || input.conversationId.startsWith("mock-chat-")) {
    return { error: "This chat is not available." };
  }

  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.from("shop_messages").insert({
    conversation_id: input.conversationId,
    sender_id: input.senderId,
    body,
  });
  if (error) {
    if (missingTable(error.message)) {
      return { error: "Chat is not set up yet. Apply migration 000026 in Supabase." };
    }
    return { error: error.message };
  }
  return { error: null };
}

export async function fetchMyBusinessIds(profileId: string): Promise<string[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.from("business_members").select("business_id").eq("profile_id", profileId);
  if (error) return [];
  return (data ?? []).map((r) => r.business_id as string);
}
