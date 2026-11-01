"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, MessageCircle, Send, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/features/auth/auth-context";
import { haptic } from "@/lib/haptics";
import { displayShopName } from "@/lib/shop-names";
import { cn } from "@/lib/utils";
import {
  fetchMyLikedProductIds,
  fetchProductComments,
  fetchProductEngagement,
  postProductComment,
  shareProductPost,
  toggleProductLikeDb,
  type ProductEngagement,
} from "@/services/marketplace-service";
import type { PublicProduct } from "@/types/database";

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

export function ProductSocialBar({
  product,
  className,
  compact = false,
}: {
  product: PublicProduct;
  className?: string;
  compact?: boolean;
}) {
  const { profile, session } = useAuth();
  const queryClient = useQueryClient();
  const [commentsOpen, setCommentsOpen] = useState(false);

  const likesQuery = useQuery({
    queryKey: ["product-likes", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: () => fetchMyLikedProductIds(profile!.id),
  });
  const engagementQuery = useQuery({
    queryKey: ["product-engagement", product.id],
    queryFn: () => fetchProductEngagement(product.id),
  });

  const liked = likesQuery.data?.has(product.id) ?? false;
  const engagement = engagementQuery.data ?? {
    like_count: Number(product.like_count ?? 0),
    comment_count: Number(product.comment_count ?? 0),
    share_count: Number(product.share_count ?? 0),
  };
  const likes = engagement.like_count;
  const comments = engagement.comment_count;
  const shares = engagement.share_count;

  function patch(engagementField: keyof ProductEngagement, delta: number) {
    queryClient.setQueryData(["product-engagement", product.id], (prev: ProductEngagement | undefined) => {
      const base = prev ?? {
        like_count: Number(product.like_count ?? 0),
        comment_count: Number(product.comment_count ?? 0),
        share_count: Number(product.share_count ?? 0),
      };
      return { ...base, [engagementField]: Math.max(0, Number(base[engagementField]) + delta) };
    });
  }

  async function like(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!session || !profile) {
      toast.message("Sign in to like this.");
      return;
    }
    haptic();
    const { liked: next, error } = await toggleProductLikeDb(profile.id, product.id);
    if (error) {
      toast.error(error);
      return;
    }
    queryClient.setQueryData(["product-likes", profile.id], (prev: Set<string> | undefined) => {
      const copy = new Set(prev ?? []);
      if (next) copy.add(product.id);
      else copy.delete(product.id);
      return copy;
    });
    patch("like_count", next ? 1 : -1);
  }

  async function share(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    haptic();
    const result = await shareProductPost(product);
    if (result.shared) {
      patch("share_count", 1);
      if (!navigator.share) toast.success("Link copied");
    }
  }

  return (
    <>
      <div className={cn("flex items-center", className)}>
        <button
          type="button"
          className={cn(
            "inline-flex items-center justify-center gap-1.5",
            compact ? "min-h-8 min-w-8 px-1.5" : "min-h-11 min-w-11 px-2.5",
          )}
          aria-label={liked ? "Unlike" : "Like"}
          onClick={(e) => void like(e)}
        >
          <Heart className={cn(compact ? "size-4" : "size-5", liked ? "fill-red-500 text-red-500" : "text-foreground")} />
          <span className={cn("font-bold tabular-nums", compact ? "text-[10px]" : "text-[12px]")}>{compactCount(likes)}</span>
        </button>
        <button
          type="button"
          className={cn(
            "inline-flex items-center justify-center gap-1.5",
            compact ? "min-h-8 min-w-8 px-1.5" : "min-h-11 min-w-11 px-2.5",
          )}
          aria-label="Comments"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setCommentsOpen(true);
          }}
        >
          <MessageCircle className={cn(compact ? "size-4" : "size-5", "text-foreground")} />
          <span className={cn("font-bold tabular-nums", compact ? "text-[10px]" : "text-[12px]")}>{compactCount(comments)}</span>
        </button>
        <button
          type="button"
          className={cn(
            "inline-flex items-center justify-center gap-1.5",
            compact ? "min-h-8 min-w-8 px-1.5" : "min-h-11 min-w-11 px-2.5",
          )}
          aria-label="Share"
          onClick={(e) => void share(e)}
        >
          <Share2 className={cn(compact ? "size-4" : "size-5", "text-foreground")} />
          <span className={cn("font-bold tabular-nums", compact ? "text-[10px]" : "text-[12px]")}>{compactCount(shares)}</span>
        </button>
      </div>
      <Sheet open={commentsOpen} onOpenChange={setCommentsOpen}>
        <SheetContent side="bottom" className="flex max-h-[85vh] flex-col overflow-hidden rounded-t-3xl p-0">
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted" />
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle className="text-center text-[16px] font-extrabold">Comments · {compactCount(comments)}</SheetTitle>
          </SheetHeader>
          <ProductCommentsThread
            productId={product.id}
            shopName={displayShopName(product.business_name)}
            onPosted={() => patch("comment_count", 1)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}

export function ProductCommentsThread({
  productId,
  shopName,
  onPosted,
}: {
  productId: string;
  shopName: string;
  onPosted?: () => void;
}) {
  const { profile, session } = useAuth();
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const commentsQuery = useQuery({
    queryKey: ["product-comments", productId],
    queryFn: async () => {
      const r = await fetchProductComments(productId);
      if (r.error) throw new Error(r.error);
      return r.comments;
    },
  });
  const comments = commentsQuery.data ?? [];
  const roots = comments.filter((c) => !c.parent_id);
  const replyName = comments.find((c) => c.id === replyTo)?.author_name;
  const me = profile?.full_name?.trim() || "You";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ul className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {commentsQuery.isPending ? <li className="text-sm text-muted-foreground">Loading comments…</li> : null}
        {commentsQuery.error ? (
          <li className="text-sm text-destructive">
            {commentsQuery.error instanceof Error ? commentsQuery.error.message : "Could not load comments."}
          </li>
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
                <p className="text-[14px] leading-snug text-zinc-800">
                  <span className="font-extrabold">{c.author_name}</span> {c.body}
                </p>
                <div className="mt-1 flex items-center gap-3 text-[11px] font-semibold text-muted-foreground">
                  <span>{timeAgo(c.created_at) || "now"}</span>
                  <button type="button" className="font-extrabold text-[#0B1F4D]" onClick={() => setReplyTo(c.id)}>
                    Reply
                  </button>
                </div>
                <ul className="mt-3 space-y-3">
                  {comments
                    .filter((r) => r.parent_id === c.id)
                    .map((r) => (
                      <li key={r.id} className="flex gap-3">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[11px] font-extrabold text-[#0B1F4D]">
                          {(r.author_name ?? "S").slice(0, 1).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[13px] leading-snug">
                            <span className="font-extrabold">{r.author_name}</span> {r.body}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{timeAgo(r.created_at) || "now"}</p>
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
          if (!session || !profile) {
            toast.message("Sign in to comment.");
            return;
          }
          const { error } = await postProductComment({
            profileId: profile.id,
            productId,
            body,
            parentId: replyTo,
          });
          if (error) toast.error(error);
          else {
            setBody("");
            setReplyTo(null);
            onPosted?.();
            void queryClient.invalidateQueries({ queryKey: ["product-comments", productId] });
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
        <Button
          type="submit"
          variant="ghost"
          disabled={!body.trim()}
          className="h-11 rounded-full px-3 font-extrabold text-[#1F7A4D]"
          aria-label="Post comment"
        >
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}
