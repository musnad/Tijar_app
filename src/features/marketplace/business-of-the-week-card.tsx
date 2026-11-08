"use client";

import { Link } from "@tanstack/react-router";
import { BadgeCheck, MapPin, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/context";
import type { BusinessOfTheWeek } from "@/services/business-of-the-week-service";

export function BusinessOfTheWeekCard({
  featured,
  following,
  onFollow,
}: {
  featured: BusinessOfTheWeek;
  following: boolean;
  onFollow: () => void;
}) {
  const { t } = useTranslation();
  const hero = featured.bannerUrl || featured.logoUrl;

  return (
    <article className="border-b border-border bg-white px-3 py-3">
      <div className="overflow-hidden rounded-2xl border border-[#F5C542]/50 bg-[#FFF9E8] shadow-[0_1px_8px_rgba(15,40,50,0.06)]">
        <div className="relative aspect-[16/9] w-full bg-[#0A2540]">
          {hero ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hero} alt="" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-3xl font-extrabold text-white">
              {featured.businessName.slice(0, 1)}
            </div>
          )}
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-[#F5C542] px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-[#0A2540]">
            <Sparkles className="size-3.5" />
            Business of the Week
          </span>
        </div>
        <div className="flex items-center gap-2 p-3">
          {featured.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={featured.logoUrl} alt="" className="size-11 shrink-0 rounded-full object-cover ring-2 ring-[#F5C542]" />
          ) : (
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#0A2540] text-sm font-extrabold text-white">
              {featured.businessName.slice(0, 1)}
            </span>
          )}
          <Link to="/b/$slug" params={{ slug: featured.slug }} className="min-w-0 flex-1">
            <p className="flex items-center gap-1 truncate text-[15px] font-extrabold">
              <span className="truncate">{featured.businessName}</span>
              {featured.isVerified ? (
                <BadgeCheck className="size-4 shrink-0 fill-primary text-white" aria-label="Verified" />
              ) : null}
            </p>
            <p className="truncate text-[12px] text-muted-foreground">
              {featured.promoText?.trim() || "Featured on TIJAR this week"}
            </p>
            {featured.locationLabel ? (
              <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                <MapPin className="size-3" />
                {featured.locationLabel}
              </p>
            ) : null}
          </Link>
          <button
            type="button"
            onClick={onFollow}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-extrabold",
              following ? "border border-border bg-white text-foreground" : "bg-primary text-white",
            )}
          >
            {following ? t("shop.feed.followingBtn") : t("shop.feed.follow")}
          </button>
        </div>
      </div>
    </article>
  );
}
