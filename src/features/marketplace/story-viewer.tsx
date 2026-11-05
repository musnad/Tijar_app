"use client";

import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { formatNgn } from "@/utils/money";
import { markStoriesViewed, type StoryRing } from "@/services/story-service";

export function StoryViewer({
  rings,
  startBusinessId,
  profileId,
  onClose,
}: {
  rings: StoryRing[];
  startBusinessId: string;
  profileId: string | null;
  onClose: () => void;
}) {
  const startIndex = Math.max(0, rings.findIndex((r) => r.businessId === startBusinessId));
  const [ringIndex, setRingIndex] = useState(startIndex);
  const [itemIndex, setItemIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const ringIndexRef = useRef(ringIndex);
  const itemIndexRef = useRef(itemIndex);
  ringIndexRef.current = ringIndex;
  itemIndexRef.current = itemIndex;

  const ring = rings[ringIndex];
  const story = ring?.stories[itemIndex];
  const durationMs = story?.media_kind === "video" ? Math.min(story.duration_ms ?? 7000, 20000) : 5000;

  const seenIds = useMemo(() => new Set<string>(), []);

  useEffect(() => {
    if (!story || !profileId || seenIds.has(story.id)) return;
    seenIds.add(story.id);
    void markStoriesViewed(profileId, [story.id]);
  }, [story, profileId, seenIds]);

  useEffect(() => {
    setProgress(0);
  }, [story?.id]);

  useEffect(() => {
    if (!story || paused) return;
    const started = Date.now();
    const tick = window.setInterval(() => {
      const pct = Math.min(1, (Date.now() - started) / durationMs);
      setProgress(pct);
      if (pct >= 1) goNext();
    }, 50);
    return () => window.clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id, paused, durationMs]);

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

  if (!ring || !story) return null;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black text-white">
      <div className="flex gap-1 px-3 pt-[max(0.7rem,env(safe-area-inset-top))]">
        {ring.stories.map((item, i) => (
          <span key={item.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
            <span
              className="block h-full bg-white"
              style={{
                width: i < itemIndex ? "100%" : i === itemIndex ? `${Math.round(progress * 100)}%` : "0%",
              }}
            />
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2 px-3 py-2">
        {ring.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ring.logoUrl} alt="" className="size-9 rounded-full object-cover" />
        ) : (
          <span className="flex size-9 items-center justify-center rounded-full bg-[#00B86B] text-sm font-extrabold">
            {ring.businessName.slice(0, 1)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-extrabold">{ring.businessName}</p>
          <p className="text-[11px] text-white/70">{ring.locationLabel || "TIJAR shop"}</p>
        </div>
        <button type="button" onClick={onClose} className="flex size-11 items-center justify-center" aria-label="Close">
          <X className="size-6" />
        </button>
      </div>

      <div
        className="relative min-h-0 flex-1"
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
      >
        {story.media_kind === "video" ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            ref={videoRef}
            src={story.media_url}
            className="h-full w-full object-contain"
            autoPlay
            playsInline
            muted={false}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={story.media_url} alt="" className="h-full w-full object-contain" />
        )}
        <button type="button" className="absolute inset-y-0 left-0 w-1/3" aria-label="Previous" onClick={goPrev} />
        <button type="button" className="absolute inset-y-0 right-0 w-1/3" aria-label="Next" onClick={goNext} />
        <ChevronLeft className="pointer-events-none absolute left-2 top-1/2 size-6 -translate-y-1/2 text-white/40" />
        <ChevronRight className="pointer-events-none absolute right-2 top-1/2 size-6 -translate-y-1/2 text-white/40" />
        {story.overlay_text || story.price != null ? (
          <div className="pointer-events-none absolute inset-x-4 bottom-28 text-center">
            {story.price != null ? (
              <p className="text-[28px] font-black tracking-tight drop-shadow">{formatNgn(story.price)}</p>
            ) : null}
            {story.overlay_text ? (
              <p className="mt-1 text-[18px] font-extrabold drop-shadow">{story.overlay_text}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        {story.product_id ? (
          <Link
            to="/shop/p/$productId"
            params={{ productId: story.product_id }}
            className="flex min-h-12 flex-1 items-center justify-center rounded-full bg-[#00B86B] text-sm font-extrabold text-white"
          >
            Shop Now
          </Link>
        ) : null}
        <Link
          to="/b/$slug"
          params={{ slug: ring.slug }}
          className="flex min-h-12 flex-1 items-center justify-center rounded-full bg-white text-sm font-extrabold text-[#0A2540]"
        >
          View Business
        </Link>
      </div>
    </div>
  );
}
