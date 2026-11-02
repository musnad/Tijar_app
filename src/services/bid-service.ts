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

type RpcRaw = {
  error?: string;
  ok?: boolean;
  sold?: boolean;
  top_bid?: number;
  winner_name?: string;
  status?: string;
};

async function callBidRpc(name: string, args: Record<string, unknown>): Promise<{ error: string | null; data: RpcRaw }> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) return { error: error.message, data: {} };
  const result = (data ?? {}) as RpcRaw;
  if (result.error) return { error: result.error, data: result };
  return { error: null, data: result };
}

async function bidAction(name: string, args: Record<string, unknown>): Promise<BidActionResult> {
  const r = await callBidRpc(name, args);
  return { error: r.error };
}

/** Place a bid on a bidding post. Returns an error message when the bid is rejected. */
export function placeBid(postId: string, amount: number): Promise<BidActionResult> {
  return bidAction("place_bid", { p_post_id: postId, p_amount: amount });
}

/** Shop confirms the winning bidder paid. */
export function confirmBidPayment(postId: string): Promise<BidActionResult> {
  return bidAction("confirm_bid_payment", { p_post_id: postId });
}

/** Winner says they have paid (bank transfer) — the shop still has to confirm. */
export function markBidPaid(postId: string): Promise<BidActionResult> {
  return bidAction("mark_bid_paid", { p_post_id: postId });
}

/** Winner did not pay in time — put the item back on the market and reopen bidding. */
export function releaseBidUnpaid(postId: string): Promise<BidActionResult> {
  return bidAction("release_bid_unpaid", { p_post_id: postId });
}

// --- Control room -----------------------------------------------------------

/** Stop accepting bids for now (the auction can be resumed). */
export function pauseBid(postId: string): Promise<BidActionResult> {
  return bidAction("pause_bid", { p_post_id: postId });
}

/** Start accepting bids again after a stop. */
export function resumeBid(postId: string): Promise<BidActionResult> {
  return bidAction("resume_bid", { p_post_id: postId });
}

/** End the bidding now. Sells to the highest bidder, or just ends if nobody bid. */
export async function closeBid(
  postId: string,
): Promise<{ error: string | null; sold: boolean; winnerName: string | null; topBid: number | null }> {
  const r = await callBidRpc("close_bid", { p_post_id: postId });
  return {
    error: r.error,
    sold: Boolean(r.data.sold),
    winnerName: r.data.winner_name ?? null,
    topBid: r.data.top_bid != null ? Number(r.data.top_bid) : null,
  };
}

/** Remove a post (it leaves the feed and every shop page). */
export function deleteVideoPost(postId: string): Promise<BidActionResult> {
  return bidAction("delete_video_post", { p_post_id: postId });
}

/** Edit the words and numbers on a post. Media cannot be replaced. */
export async function updateVideoPost(
  postId: string,
  patch: {
    caption?: string | null;
    price?: number | null;
    bidStartingPrice?: number | null;
    bidStartsAt?: string | null;
    bidEndsAt?: string | null;
    bidSaleLimit?: number | null;
  },
): Promise<BidActionResult> {
  const supabase = getSupabaseBrowserClient();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.caption !== undefined) row["caption"] = patch.caption;
  if (patch.price !== undefined) row["price"] = patch.price;
  if (patch.bidStartingPrice !== undefined) row["bid_starting_price"] = patch.bidStartingPrice;
  if (patch.bidStartsAt !== undefined) row["bid_starts_at"] = patch.bidStartsAt;
  if (patch.bidEndsAt !== undefined) row["bid_ends_at"] = patch.bidEndsAt;
  if (patch.bidSaleLimit !== undefined) row["bid_sale_limit"] = patch.bidSaleLimit;
  const { error } = await supabase.from("video_posts").update(row).eq("id", postId);
  return { error: error?.message ?? null };
}

/** One post from the public feed, for the bid detail page. */
export async function fetchVideoPostById(postId: string): Promise<PublicFeedVideo | null> {
  if (!postId) return null;
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.from("public_video_feed").select("*").eq("id", postId).maybeSingle();
  if (error || !data) return null;
  return data as PublicFeedVideo;
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

export type BidPhase = "upcoming" | "open" | "paused" | "ended" | "sold" | "paid" | "closed";

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
  if (post.bid_status === "closed") return "closed";
  if (post.bid_status === "paused") return "paused";
  const now = Date.now();
  if (post.bid_starts_at && now < new Date(post.bid_starts_at).getTime()) return "upcoming";
  if (post.bid_ends_at && now > new Date(post.bid_ends_at).getTime()) return "ended";
  return "open";
}
