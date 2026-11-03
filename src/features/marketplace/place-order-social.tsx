"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, MessageCircle, Send, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShareSheet } from "@/components/share-sheet";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/features/auth/auth-context";
import { useAccountGate } from "@/features/auth/account-gate";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import {
  deletePlaceOrderComment,
  fetchMyLikedPlaceOrderIds,
  fetchPlaceOrderComments,
  placeOrderShareUrl,
  postPlaceOrderComment,
  recordPlaceOrderShare,
  sharePlaceOrderPost,
  togglePlaceOrderLike,
  updatePlaceOrderComment,
  type PlaceOrderComment,
  type PlaceOrderListing,
} from "@/services/place-order-service";

function compactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function patchListingCounts(
  queryClient: ReturnType<typeof useQueryClient>,
  listingId: string,
  field: "like_count" | "comment_count" | "share_count",
  delta: number,
) {
  const apply = (listing: PlaceOrderListing) =>
    listing.id === listingId ? { ...listing, [field]: Math.max(0, Number(listing[field] ?? 0) + delta) } : listing;
  queryClient.setQueryData(["place-order-listing", listingId], (old: PlaceOrderListing | null | undefined) =>
    old ? apply(old) : old,
  );
  queryClient.setQueryData(["for-you-place-orders"], (old: PlaceOrderListing[] | undefined) => old?.map(apply));
  queryClient.setQueriesData({ queryKey: ["place-order-listings"] }, (old: unknown) => {
    if (!old || typeof old !== "object" || !("listings" in old)) return old;
    const data = old as { listings: PlaceOrderListing[]; error: string | null };
    return { ...data, listings: data.listings.map(apply) };
  });
  queryClient.setQueriesData({ queryKey: ["place-order-mine-listings"] }, (old: PlaceOrderListing[] | undefined) =>
    old?.map(apply),
  );
}

export function PlaceOrderSocialBar({
  listing,
  className,
  compact = false,
}: {
  listing: PlaceOrderListing;
  className?: string;
  compact?: boolean;
}) {
  const { profile } = useAuth();
  const { requireAccount } = useAccountGate();
  const queryClient = useQueryClient();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const likesQuery = useQuery({
    queryKey: ["place-order-likes", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: () => fetchMyLikedPlaceOrderIds(profile!.id),
  });
  const liked = likesQuery.data?.has(listing.id) ?? false;
  const likes = Number(listing.like_count ?? 0);
  const comments = Number(listing.comment_count ?? 0);
  const shares = Number(listing.share_count ?? 0);

  async function like() {
    if (!requireAccount("like") || !profile) {
      return;
    }
    haptic();
    const { liked: next, error } = await togglePlaceOrderLike(profile.id, listing.id);
    if (error) {
      toast.error(error);
      return;
    }
    queryClient.setQueryData(["place-order-likes", profile.id], (prev: Set<string> | undefined) => {
      const copy = new Set(prev ?? []);
      if (next) copy.add(listing.id);
      else copy.delete(listing.id);
      return copy;
    });
    patchListingCounts(queryClient, listing.id, "like_count", next ? 1 : -1);
  }

  function share() {
    haptic();
    setShareOpen(true);
  }

  async function handleShared() {
    patchListingCounts(queryClient, listing.id, "share_count", 1);
    await recordPlaceOrderShare(listing.id);
  }

  return (
    <>
      <div className={cn("flex items-center", className)}>
        <button type="button" data-place-order-like={listing.id} className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 px-2.5" aria-label={liked ? "Unlike" : "Like"} onClick={() => void like()}>
          <Heart className={cn("size-5", liked ? "fill-red-500 text-red-500" : "text-foreground")} />
          <span className="text-[12px] font-bold tabular-nums">{compactCount(likes)}</span>
        </button>
        <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 px-2.5" aria-label="Comments" onClick={() => setCommentsOpen(true)}>
          <MessageCircle className="size-5 text-foreground" />
          <span className="text-[12px] font-bold tabular-nums">{compactCount(comments)}</span>
        </button>
        <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 px-2.5" aria-label="Share" onClick={() => share()}>
          <Share2 className="size-5 text-foreground" />
          <span className="text-[12px] font-bold tabular-nums">{compactCount(shares)}</span>
        </button>
      </div>
      <ShareSheet
        open={shareOpen}
        onOpenChange={setShareOpen}
        title={listing.title}
        text={`Place your order from ${listing.shop_name} on TIJAR`}
        url={placeOrderShareUrl(listing.id)}
        onShared={() => void handleShared()}
      />
      {!compact && likes > 0 ? <p className="px-3 text-[14px] font-extrabold">{compactCount(likes)} likes</p> : null}
      {!compact && comments > 0 ? (
        <button type="button" className="px-3 pb-1 text-left text-[14px] font-semibold text-muted-foreground" onClick={() => setCommentsOpen(true)}>
          View all {compactCount(comments)} comments
        </button>
      ) : null}
      <Sheet open={commentsOpen} onOpenChange={setCommentsOpen}>
        <SheetContent side="bottom" className="flex max-h-[85vh] flex-col overflow-hidden rounded-t-3xl p-0">
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted" />
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle className="text-center text-[16px] font-extrabold">Comments · {compactCount(comments)}</SheetTitle>
          </SheetHeader>
          <PlaceOrderCommentsThread
            listingId={listing.id}
            shopName={listing.shop_name}
            onPosted={() => patchListingCounts(queryClient, listing.id, "comment_count", 1)}
            onDeleted={() => patchListingCounts(queryClient, listing.id, "comment_count", -1)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}

export function PlaceOrderCommentsThread({
  listingId,
  shopName,
  onPosted,
  onDeleted,
}: {
  listingId: string;
  shopName: string;
  onPosted?: () => void;
  onDeleted?: () => void;
}) {
  const { profile } = useAuth();
  const { requireAccount } = useAccountGate();
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const queryClient = useQueryClient();
  const commentsQuery = useQuery({
    queryKey: ["place-order-comments", listingId],
    queryFn: async () => {
      const r = await fetchPlaceOrderComments(listingId);
      if (r.error) throw new Error(r.error);
      return r.comments;
    },
  });
  const comments = commentsQuery.data ?? [];
  const roots = comments.filter((c) => !c.parent_id);
  const replyName = comments.find((c) => c.id === replyTo)?.author_name;
  const me = profile?.full_name?.trim() || "You";

  function startEdit(commentId: string, current: string) {
    setEditingId(commentId);
    setEditBody(current);
  }

  async function saveEdit() {
    if (!editingId || !profile) return;
    const text = editBody.trim();
    if (!text) return;
    const { error } = await updatePlaceOrderComment({ commentId: editingId, profileId: profile.id, body: text });
    if (error) {
      toast.error(error);
      return;
    }
    setEditingId(null);
    setEditBody("");
    void queryClient.invalidateQueries({ queryKey: ["place-order-comments", listingId] });
  }

  async function remove(commentId: string) {
    if (!profile) return;
    if (typeof window !== "undefined" && !window.confirm("Delete this comment?")) return;
    const { error } = await deletePlaceOrderComment({ commentId, profileId: profile.id });
    if (error) {
      toast.error(error);
      return;
    }
    onDeleted?.();
    void queryClient.invalidateQueries({ queryKey: ["place-order-comments", listingId] });
  }

  function renderBody(comment: PlaceOrderComment, small = false) {
    if (editingId === comment.id) {
      return (
        <div className="mt-1 flex items-center gap-2">
          <Input
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            className="h-9 rounded-full border-border text-[13px]"
            autoFocus
          />
          <Button
            type="button"
            size="sm"
            className="h-9 rounded-full px-3 text-[12px] font-extrabold"
            disabled={!editBody.trim()}
            onClick={() => void saveEdit()}
          >
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-9 rounded-full px-2 text-[12px] font-semibold"
            onClick={() => {
              setEditingId(null);
              setEditBody("");
            }}
          >
            Cancel
          </Button>
        </div>
      );
    }
    return (
      <p className={cn("leading-snug", small ? "text-[13px]" : "text-[14px] text-zinc-800")}>
        <span className="font-extrabold">{comment.author_name}</span> {comment.body}
      </p>
    );
  }

  function renderActions(comment: PlaceOrderComment, allowReply: boolean) {
    const mine = Boolean(profile && comment.profile_id === profile.id);
    return (
      <div className="mt-1 flex items-center gap-3 text-[11px] font-semibold text-muted-foreground">
        <span>{timeAgo(comment.created_at) || "now"}</span>
        {allowReply ? (
          <button type="button" className="font-extrabold text-[#0B1F4D]" onClick={() => setReplyTo(comment.id)}>
            Reply
          </button>
        ) : null}
        {mine ? (
          <>
            <button
              type="button"
              className="font-extrabold text-[#0B1F4D]"
              onClick={() => startEdit(comment.id, comment.body)}
            >
              Edit
            </button>
            <button type="button" className="font-extrabold text-destructive" onClick={() => void remove(comment.id)}>
              Delete
            </button>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ul className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {commentsQuery.isPending ? <li className="text-sm text-muted-foreground">Loading comments…</li> : null}
        {commentsQuery.error ? (
          <li className="text-sm text-destructive">{commentsQuery.error instanceof Error ? commentsQuery.error.message : "Could not load comments."}</li>
        ) : null}
        {!commentsQuery.isPending && !commentsQuery.error && roots.length === 0 ? (
          <li className="py-10 text-center text-sm text-muted-foreground">No comments yet. Be the first.</li>
        ) : null}
        {roots.map((c) => (
          <li key={c.id}>
            <div className="flex gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#0B1F4D] text-[12px] font-extrabold text-white">
                {(c.author_name ?? "S").slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                {renderBody(c)}
                {renderActions(c, true)}
                <ul className="mt-3 space-y-3">
                  {comments
                    .filter((r) => r.parent_id === c.id)
                    .map((r) => (
                      <li key={r.id} className="flex gap-3">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[11px] font-extrabold text-[#0B1F4D]">
                          {(r.author_name ?? "S").slice(0, 1).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          {renderBody(r, true)}
                          {renderActions(r, false)}
                        </div>
                      </li>
                    ))}
                </ul>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <form
        className="flex items-center gap-2 border-t border-border bg-white px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!requireAccount("comment") || !profile) {
            return;
          }
          const { error } = await postPlaceOrderComment({
            profileId: profile.id,
            listingId,
            body,
            parentId: replyTo,
          });
          if (error) toast.error(error);
          else {
            setBody("");
            setReplyTo(null);
            onPosted?.();
            void queryClient.invalidateQueries({ queryKey: ["place-order-comments", listingId] });
          }
        }}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#1F7A4D] text-[12px] font-extrabold text-white">
          {me.slice(0, 1).toUpperCase()}
        </span>
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={replyTo ? `Reply to ${replyName ?? "comment"}…` : `Add a comment for ${shopName}…`}
          className="h-11 rounded-full border-border"
        />
        <Button type="submit" variant="ghost" disabled={!body.trim()} className="h-11 rounded-full px-3 font-extrabold text-[#1F7A4D]" aria-label="Post comment">
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}

export function PlaceOrderShareButton({ listing, label = "Share link" }: { listing: PlaceOrderListing; label?: string }) {
  const queryClient = useQueryClient();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="rounded-full"
      onClick={async () => {
        const result = await sharePlaceOrderPost(listing);
        if (result.shared) {
          patchListingCounts(queryClient, listing.id, "share_count", 1);
          if (!navigator.share) toast.success("Link copied");
        }
      }}
    >
      <Share2 className="mr-1 size-3.5" />
      {label}
    </Button>
  );
}
