"use client";

import { useState } from "react";

import {
  imageSizesFor,
  markOptimizedImageFailed,
  optimizedImageSrcSet,
  optimizedImageUrl,
} from "@/lib/media/optimize";
import { cn } from "@/lib/utils";

export function FeedImage({
  src,
  alt = "",
  className,
  eager = false,
  width = 540,
}: {
  src: string;
  alt?: string;
  className?: string;
  eager?: boolean;
  width?: number;
}) {
  const [failed, setFailed] = useState(false);
  const shown = failed ? src : optimizedImageUrl(src, width);
  const srcSet = failed ? undefined : optimizedImageSrcSet(src, width);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={shown}
      srcSet={srcSet}
      sizes={imageSizesFor(width)}
      alt={alt}
      width={width}
      height={Math.round(width * 1.25)}
      decoding="async"
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : "low"}
      className={cn("h-full w-full bg-zinc-100 object-cover", className)}
      onError={() => {
        if (!failed) markOptimizedImageFailed();
        setFailed(true);
      }}
    />
  );
}
