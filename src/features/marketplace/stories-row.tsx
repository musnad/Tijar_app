"use client";

import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";

import { FeedImage } from "@/components/media/feed-image";
import { cn } from "@/lib/utils";
import type { StoryRing } from "@/services/story-service";
import { formatDistance } from "@/utils/discover";

export function StoriesRow({
  rings,
  canCreate,
  onOpen,
}: {
  rings: StoryRing[];
  canCreate: boolean;
  onOpen: (businessId: string) => void;
}) {
  if (!canCreate && rings.length === 0) return null;

  return (
    <div className="border-b border-[#EEF1F5] bg-white">
      <div className="flex gap-3 overflow-x-auto px-3 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {canCreate ? (
          <Link to="/shop/create-story" className="flex w-[4.5rem] shrink-0 flex-col items-center gap-1">
            <span className="relative flex size-[4.15rem] items-center justify-center rounded-full bg-[#F3F4F6]">
              <span className="flex size-[3.7rem] items-center justify-center rounded-full bg-white text-[#0A2540]">
                <Plus className="size-7" strokeWidth={2.4} />
              </span>
              <span className="absolute bottom-0 right-0 flex size-5 items-center justify-center rounded-full bg-[#00B86B] text-[11px] font-black text-white ring-2 ring-white">
                +
              </span>
            </span>
            <span className="w-full truncate text-center text-[11px] font-bold text-[#0A2540]">Your story</span>
          </Link>
        ) : null}
        {rings.map((ring) => (
          <button
            key={ring.businessId}
            type="button"
            onClick={() => onOpen(ring.businessId)}
            className="flex w-[4.5rem] shrink-0 flex-col items-center gap-1"
          >
            <span
              className={cn(
                "flex size-[4.15rem] items-center justify-center rounded-full p-[2.5px]",
                ring.featured
                  ? "bg-gradient-to-tr from-[#F5C542] via-[#00B86B] to-[#0A2540]"
                  : ring.unseen
                    ? "bg-gradient-to-tr from-[#00B86B] via-[#1F7A4D] to-[#0A2540]"
                    : "bg-[#D1D5DB]",
              )}
            >
              <span className="flex size-full items-center justify-center overflow-hidden rounded-full bg-white p-[2px]">
                {ring.logoUrl ? (
                  <FeedImage src={ring.logoUrl} alt="" eager width={88} className="size-full rounded-full object-cover" />
                ) : (
                  <span className="flex size-full items-center justify-center rounded-full bg-[#0A2540] text-lg font-extrabold text-white">
                    {ring.businessName.slice(0, 1)}
                  </span>
                )}
              </span>
            </span>
            <span className="w-full truncate text-center text-[11px] font-semibold text-[#0A2540]">
              {ring.businessName}
            </span>
            {ring.distanceKm != null ? (
              <span className="text-[9px] font-bold text-[#00B86B]">{formatDistance(ring.distanceKm)}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
