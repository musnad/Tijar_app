import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { PublicFeedVideo } from "@/services/video-feed-service";

export type BidOffer = {
  id: string;
  post_id: string;
  bidder_id: string;
  bidder_name: string;
  amount: number;
  created_at: string;
};

export type BidActionResult = { error: string | null };

type RpcResult = { error?: string; ok?: boolean; sold?: boolean; top_bid?: number; winner_name?: string };

async function callBidRpc(name: string, args: Record<string, unknown>): Promise<BidActionResult> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) return { error: error.message };
  const result = (data ?? {}) as RpcResult;
  if (result.error) return { error: result.error };
  return { error: null };
}

/** Place a bid on a bidding post. Returns an error message when the bid is rejected. */
export function placeBid(postId: string, amount: number): Promise<BidActionResult> {
  return callBidRpc("place_bid", { p_post_id: postId, p_amount: amount });
}

/** Shop confirms the winning bidder paid. */
export function confirmBidPayment(postId: string): Promise<BidActionResult> {
  return callBidRpc("confirm_bid_payment", { p_post_id: postId });
}

/** Winner says they have paid (bank transfer) — the shop still has to confirm. */
export function markBidPaid(postId: string): Promise<BidActionResult> {
  return callBidRpc("mark_bid_paid", { p_post_id: postId });
}

/** Winner did not pay in time — put the item back on the market and reopen bidding. */
export function releaseBidUnpaid(postId: string): Promise<BidActionResult> {
  return callBidRpc("release_bid_unpaid", { p_post_id: postId });
}

export async function fetchBidOffers(postId: string): Promise<BidOffer[]> {
  if (!postId) return [];
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("bid_offers")
    .select("id, post_id, bidder_id, bidder_name, amount, created_at")
    .eq("post_id", postId)
    .order("amount", { ascending: false })
    .limit(50);
  if (error) return [];
  return (data ?? []).map((row) => ({
    id: row.id as string,
    post_id: row.post_id as string,
    bidder_id: row.bidder_id as string,
    bidder_name: (row.bidder_name as string) ?? "A shopper",
    amount: Number(row.amount),
    created_at: row.created_at as string,
  }));
}

/** Every bidding post this shop has created, newest first. */
export async function fetchMyBidPosts(businessId: string): Promise<PublicFeedVideo[]> {
  if (!businessId) return [];
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("public_video_feed")
    .select("*")
    .eq("business_id", businessId)
    .eq("post_type", "bid")
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) return [];
  return (data ?? []) as PublicFeedVideo[];
}

/** True while the winner still has time left to pay. */
export function bidPaymentSecondsLeft(post: {
  bid_status?: string | null;
  bid_payment_due_at?: string | null;
  bid_paid_at?: string | null;
}): number {
  if (post.bid_status !== "sold" || post.bid_paid_at) return 0;
  if (!post.bid_payment_due_at) return 0;
  const ms = new Date(post.bid_payment_due_at).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 1000) : 0;
}

export type BidPhase = "upcoming" | "open" | "ended" | "sold" | "paid";

/** What the auction is doing right now, from the viewer's clock. */
export function bidPhase(post: {
  post_type?: string | null;
  bid_status?: string | null;
  bid_starts_at?: string | null;
  bid_ends_at?: string | null;
  bid_payment_due_at?: string | null;
  bid_paid_at?: string | null;
}): BidPhase {
  if (post.bid_status === "paid" || post.bid_paid_at) return "paid";
  if (post.bid_status === "sold") return "sold";
  const now = Date.now();
  if (post.bid_starts_at && now < new Date(post.bid_starts_at).getTime()) return "upcoming";
  if (post.bid_ends_at && now > new Date(post.bid_ends_at).getTime()) return "ended";
  return "open";
}
