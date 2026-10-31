"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

import { FeedImage } from "@/components/media/feed-image";
import { cn } from "@/lib/utils";

export function MediaCarousel({
  urls,
  eager = false,
  onDoubleTap,
  className,
  empty,
}: {
  urls: string[];
  eager?: boolean;
  onDoubleTap?: () => void;
  className?: string;
  empty?: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const last = useRef(0);
  const [index, setIndex] = useState(0);
  const total = urls.length;

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el || total === 0) return;
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    setIndex(Math.min(total - 1, Math.max(0, i)));
  }, [total]);

  function onClick() {
    if (!onDoubleTap) return;
    const now = Date.now();
    if (now - last.current < 280) {
      last.current = 0;
      onDoubleTap();
      return;
    }
    last.current = now;
  }

  if (total === 0) {
    return <div className={cn("relative h-full w-full bg-zinc-100", className)}>{empty}</div>;
  }

  return (
    <div className={cn("relative h-full w-full", className)}>
      <div
        ref={scroller}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={onScroll}
        onClick={onClick}
        aria-label={total > 1 ? `Photos, ${index + 1} of ${total}. Swipe for more.` : "Photo"}
      >
        {urls.map((src, i) => (
          <div key={`${src}-${i}`} className="h-full w-full shrink-0 snap-center">
            <FeedImage src={src} alt="" eager={eager && i === 0} width={720} />
          </div>
        ))}
      </div>
      {total > 1 ? (
        <>
          <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-bold tabular-nums text-white">
            {index + 1}/{total}
          </span>
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1">
            {urls.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full",
                  i === index ? "w-4 bg-white" : "w-1.5 bg-white/45",
                )}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
