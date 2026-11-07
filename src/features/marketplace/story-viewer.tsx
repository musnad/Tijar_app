"use client";

import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Eye, Heart, MessageCircle, Send, Share2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ShareSheet } from "@/components/share-sheet";
import { CommerceSticker } from "@/features/marketplace/commerce-sticker";
import { useAccountGate } from "@/features/auth/account-gate";
import { cn } from "@/lib/utils";
import {
  fetchMyStoryLikedIds,
  fetchStoryComments,
  fetchStoryViewers,
  markStoriesViewed,
  postStoryComment,
  toggleStoryLike,
  type StoryRing,
  type StoryViewerPerson,
} from "@/services/story-service";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return "1 day ago";
}

export function StoryViewer({
  rings,
  startBusinessId,
  profileId,
  ownerBusinessId,
  onClose,
}: {
  rings: StoryRing[];
  startBusinessId: string;
  profileId: string | null;
  ownerBusinessId?: string | null;
  onClose: () => void;
}) {
  const { requireAccount } = useAccountGate();
  const navigate = useNavigate();
  const startIndex = Math.max(0, rings.findIndex((r) => r.businessId === startBusinessId));
  const [ringIndex, setRingIndex] = useState(startIndex);
  const [itemIndex, setItemIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [reply, setReply] = useState("");
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [comments, setComments] = useState<Array<{ id: string; body: string; created_at: string; author_name: string }>>([]);
  const [viewers, setViewers] = useState<StoryViewerPerson[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const ringIndexRef = useRef(ringIndex);
  const itemIndexRef = useRef(itemIndex);
  ringIndexRef.current = ringIndex;
  itemIndexRef.current = itemIndex;

  const ring = rings[ringIndex];
  const story = ring?.stories[itemIndex];
  const isOwner = Boolean(ownerBusinessId && ring?.businessId === ownerBusinessId);
  const durationMs = story?.media_kind === "video" ? Math.min(story.duration_ms ?? 7000, 20000) : 5000;
  const seenIds = useMemo(() => new Set<string>(), []);
  const shareUrl =
    typeof window !== "undefined" && ring
      ? `${window.location.origin}/b/${ring.slug}`
      : "";

  useEffect(() => {
    if (!story || !profileId || seenIds.has(story.id)) return;
    seenIds.add(story.id);
    void markStoriesViewed(profileId, [story.id]);
  }, [story, profileId, seenIds]);

  useEffect(() => {
    setProgress(0);
    setReply("");
    setCommentsOpen(false);
    setViewersOpen(false);
    if (!story) return;
    setLikeCount(story.like_count);
    if (!profileId) {
      setLiked(false);
      return;
    }
    void fetchMyStoryLikedIds(profileId, [story.id]).then((ids) => setLiked(ids.has(story.id)));
  }, [story?.id, profileId]);

  useEffect(() => {
    if (!story || paused || commentsOpen || viewersOpen || shareOpen) return;
    const started = Date.now();
    const tick = window.setInterval(() => {
      const pct = Math.min(1, (Date.now() - started) / durationMs);
      setProgress(pct);
      if (pct >= 1) goNext();
    }, 50);
    return () => window.clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id, paused, durationMs, commentsOpen, viewersOpen, shareOpen]);

  function goNext() {
    const ri = ringIndexRef.current;
    const ii = itemIndexRef.current;
    const current = rings[ri];
    if (!current) return;
    if (ii + 1 < current.stories.length) {
      setItemIndex(ii + 1);
      return;
    }
    if (ri + 1 < rings.length) {
      setRingIndex(ri + 1);
      setItemIndex(0);
      return;
    }
    onClose();
  }

  function goPrev() {
    if (itemIndex > 0) {
      setItemIndex((n) => n - 1);
      return;
    }
    if (ringIndex > 0) {
      const prev = rings[ringIndex - 1];
      setRingIndex((n) => n - 1);
      setItemIndex(Math.max(0, (prev?.stories.length ?? 1) - 1));
    }
  }

  async function onLike() {
    if (!requireAccount("like") || !profileId || !story) return;
    const r = await toggleStoryLike(profileId, story.id);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    setLiked(r.liked);
    setLikeCount((n) => Math.max(0, n + (r.liked ? 1 : -1)));
  }

  async function sendReply() {
    if (!requireAccount("comment") || !profileId || !story) return;
    const r = await postStoryComment(profileId, story.id, reply);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    setReply("");
    toast.success("Reply sent");
  }

  async function openComments() {
    if (!story) return;
    setPaused(true);
    setCommentsOpen(true);
    const r = await fetchStoryComments(story.id);
    if (r.error) toast.error(r.error);
    else setComments(r.comments);
  }

  async function openViewers() {
    if (!story || !isOwner) return;
    setPaused(true);
    setViewersOpen(true);
    const r = await fetchStoryViewers(story.id);
    if (r.error) toast.error(r.error);
    else setViewers(r.people);
  }

  function pay() {
    if (!story || !ring) return;
    onClose();
    if (story.place_order_listing_id) {
      void navigate({
        to: "/shop/order-now/$listingId",
        params: { listingId: story.place_order_listing_id },
      });
      return;
    }
    if (story.product_id) {
      void navigate({ to: "/shop/buy", search: { productId: story.product_id } });
      return;
    }
    toast.message("Open the shop to order.");
    void navigate({ to: "/b/$slug", params: { slug: ring.slug } });
  }

  if (!ring || !story) return null;
  const stickerTitle = story.overlay_text || story.product_name || ring.businessName;
  const stickerPrice = story.price;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#3B0A5C] text-white">
      <div className="flex gap-1 px-3 pt-[max(0.7rem,env(safe-area-inset-top))]">
        {ring.stories.map((item, i) => (
          <span key={item.id} className="h-[2.5px] flex-1 overflow-hidden rounded-full bg-white/35">
            <span
              className="block h-full bg-white"
              style={{
                width: i < itemIndex ? "100%" : i === itemIndex ? `${Math.round(progress * 100)}%` : "0%",
              }}
            />
          </span>
        ))}
      </div>

      <div className="flex items-center gap-2 px-2 py-2">
        <button type="button" onClick={onClose} className="flex size-11 items-center justify-center" aria-label="Back">
          <ArrowLeft className="size-6" />
        </button>
        {ring.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ring.logoUrl} alt="" className="size-9 rounded-full object-cover" />
        ) : (
          <span className="flex size-9 items-center justify-center rounded-full bg-[#00B86B] text-sm font-extrabold">
            {ring.businessName.slice(0, 1)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-extrabold">{ring.businessName}</p>
          <p className="text-[11px] text-white/70">{timeAgo(story.created_at)}</p>
        </div>
        {isOwner ? (
          <button type="button" onClick={() => void openViewers()} className="flex items-center gap-1 rounded-full bg-black/25 px-2.5 py-1.5 text-[12px] font-bold">
            <Eye className="size-4" />
            Views
          </button>
        ) : null}
      </div>

      <div className="relative mx-4 min-h-0 flex-1 overflow-hidden rounded-3xl bg-black/20">
        {story.media_kind === "video" ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            ref={videoRef}
            src={story.media_url}
            className="h-full w-full object-contain"
            autoPlay
            playsInline
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={story.media_url} alt="" className="h-full w-full object-contain" />
        )}
        <button type="button" className="absolute inset-y-0 left-0 w-1/4" aria-label="Previous" onClick={goPrev} />
        <button type="button" className="absolute inset-y-0 right-0 w-1/4" aria-label="Next" onClick={goNext} />
        <div className="pointer-events-auto absolute bottom-3 left-3 z-10 max-w-[85%]">
          <CommerceSticker
            title={stickerTitle}
            imageUrl={story.product_image || ring.logoUrl}
            price={stickerPrice}
            host="tijar.ng"
            onPay={pay}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 pb-[max(0.8rem,env(safe-area-inset-bottom))] pt-3">
        <div className="flex min-h-11 min-w-0 flex-1 items-center rounded-full border border-white/35 bg-black/20 px-4">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
            placeholder="Reply"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-white/70"
          />
          {reply.trim() ? (
            <button type="button" onClick={() => void sendReply()} aria-label="Send" className="pl-2">
              <Send className="size-5" />
            </button>
          ) : null}
        </div>
        <button type="button" onClick={() => void openComments()} className="flex size-11 items-center justify-center" aria-label="Comments">
          <MessageCircle className="size-6" />
        </button>
        <button type="button" onClick={() => void onLike()} className="flex size-11 items-center justify-center" aria-label="Like">
          <Heart className={cn("size-7", liked ? "fill-[#00B86B] text-[#00B86B]" : "text-white")} />
        </button>
        <button
          type="button"
          onClick={() => {
            setPaused(true);
            setShareOpen(true);
          }}
          className="flex size-11 items-center justify-center"
          aria-label="Share"
        >
          <Share2 className="size-6" />
        </button>
      </div>
      {likeCount > 0 ? <p className="px-5 pb-2 text-[11px] font-semibold text-white/70">{likeCount} likes</p> : null}

      {commentsOpen ? (
        <div className="absolute inset-x-0 bottom-0 z-20 max-h-[55%] overflow-y-auto rounded-t-3xl bg-white p-4 text-[#0A2540]">
          <button type="button" className="mb-3 text-sm font-bold" onClick={() => setCommentsOpen(false)}>
            Close comments
          </button>
          {comments.length === 0 ? <p className="text-sm text-muted-foreground">Be the first to reply.</p> : null}
          <ul className="space-y-3">
            {comments.map((c) => (
              <li key={c.id}>
                <p className="text-[13px] font-extrabold">{c.author_name}</p>
                <p className="text-[13px]">{c.body}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {viewersOpen ? (
        <div className="absolute inset-x-0 bottom-0 z-20 max-h-[55%] overflow-y-auto rounded-t-3xl bg-white p-4 text-[#0A2540]">
          <button type="button" className="mb-3 text-sm font-bold" onClick={() => setViewersOpen(false)}>
            Close
          </button>
          <p className="mb-3 text-[15px] font-extrabold">{viewers.length} people saw this</p>
          {viewers.length === 0 ? <p className="text-sm text-muted-foreground">No views yet.</p> : null}
          <ul className="space-y-2">
            {viewers.map((person) => (
              <li key={person.profileId} className="flex items-center gap-3">
                {person.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={person.avatarUrl} alt="" className="size-10 rounded-full object-cover" />
                ) : (
                  <span className="flex size-10 items-center justify-center rounded-full bg-[#0A2540] text-sm font-extrabold text-white">
                    {person.name.slice(0, 1)}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate font-bold">{person.name}</span>
                <span className="text-[11px] text-muted-foreground">{timeAgo(person.viewedAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ShareSheet
        open={shareOpen}
        onOpenChange={(open) => {
          setShareOpen(open);
          if (!open) setPaused(false);
        }}
        title={ring.businessName}
        text={stickerTitle}
        url={shareUrl}
        imageUrl={story.media_url}
      />
    </div>
  );
}
