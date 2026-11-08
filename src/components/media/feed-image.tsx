"use client";

import { useState } from "react";

import { optimizedImageUrl } from "@/lib/media/optimize";
import { cn } from "@/lib/utils";

export function FeedImage({
  src,
  alt = "",
  className,
  eager = false,
  width = 720,
}: {
  src: string;
  alt?: string;
  className?: string;
  eager?: boolean;
  width?: number;
}) {
  const [failed, setFailed] = useState(false);
  const shown = failed ? src : optimizedImageUrl(src, width);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={shown}
      alt={alt}
      width={width}
      height={Math.round(width * 1.25)}
      decoding="async"
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : "low"}
      className={cn("h-full w-full object-cover", className)}
      onError={() => setFailed(true)}
    />
  );
}
