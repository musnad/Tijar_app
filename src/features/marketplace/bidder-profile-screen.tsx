"use client";

import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, BadgeCheck, Calendar, Gavel, Mail, Phone, Store, Trophy } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { fetchBidderCard } from "@/services/bid-service";
import { formatNgn } from "@/utils/money";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function memberSince(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function BidderProfileScreen({ profileId, postId }: { profileId: string; postId: string | null }) {
  const navigate = useNavigate();
  const cardQuery = useQuery({
    queryKey: ["bidder-card", postId, profileId],
    queryFn: () => fetchBidderCard(postId ?? "", profileId),
    enabled: Boolean(postId),
  });
  const card = cardQuery.data ?? null;

  return (
    <div className="pb-10">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void navigate({ to: "/shop" })}
          className="flex size-9 items-center justify-center rounded-full border border-border"
          aria-label="Back"
        >
          <ArrowLeft className="size-4" />
        </button>
        <h1 className="text-lg font-extrabold text-foreground">Bidder account</h1>
      </div>

      {!postId ? (
        <p className="mt-8 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          <Link to="/shop/u/$profileId" params={{ profileId }} className="font-extrabold text-primary">
            Open public profile
          </Link>
        </p>
      ) : cardQuery.isLoading ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">Loading account…</p>
      ) : !card ? (
        <p className="mt-8 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          This account could not be loaded.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {/* Identity */}
          <div className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAF9] p-4">
            <div className="flex items-center gap-3">
              <Avatar className="size-14 border border-white shadow-sm">
                {card.avatarUrl ? <AvatarImage src={card.avatarUrl} alt="" /> : null}
                <AvatarFallback className="bg-[#0B1F4D] text-base font-extrabold text-white">
                  {initials(card.fullName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-extrabold text-foreground">{card.fullName}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {card.isWinner ? (
                    <span className="flex items-center gap-1 rounded-full bg-[#0B1F4D] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
                      <Trophy className="size-3 text-amber-300" /> Winner
                    </span>
                  ) : card.highestBid != null ? (
                    <span className="flex items-center gap-1 rounded-full bg-[#E9F7EF] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[#1F7A4D]">
                      <BadgeCheck className="size-3" /> Bidder
                    </span>
                  ) : null}
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Calendar className="size-3" /> Member since {memberSince(card.joinedAt)}
                  </span>
                </div>
              </div>
            </div>
            {card.bio ? <p className="mt-3 whitespace-pre-line text-[13px] text-foreground">{card.bio}</p> : null}
          </div>

          {/* This auction */}
          {card.highestBid != null ? (
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-wide text-[#6B7280]">
                <Gavel className="size-3.5 text-[#1F7A4D]" /> On this bidding
              </p>
              <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-muted/50 px-2 py-2">
                  <dt className="text-[11px] text-muted-foreground">Bids</dt>
                  <dd className="text-sm font-extrabold text-[#0B1F4D]">{card.bidCount}</dd>
                </div>
                <div className="rounded-xl bg-muted/50 px-2 py-2">
                  <dt className="text-[11px] text-muted-foreground">Highest</dt>
                  <dd className="text-sm font-extrabold text-[#0B1F4D]">{formatNgn(card.highestBid)}</dd>
                </div>
                <div className="rounded-xl bg-muted/50 px-2 py-2">
                  <dt className="text-[11px] text-muted-foreground">Last bid</dt>
                  <dd className="text-sm font-extrabold text-[#0B1F4D]">
                    {card.lastBidAt ? timeAgo(card.lastBidAt) : "—"}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}

          {/* Contact — only for the shop running the bidding */}
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[12px] font-extrabold uppercase tracking-wide text-[#6B7280]">Contact</p>
            {card.canViewContact && (card.phone || card.email) ? (
              <div className="mt-2 grid gap-2">
                {card.phone ? (
                  <a
                    href={`tel:${card.phone}`}
                    className="flex min-h-11 items-center justify-between rounded-xl border border-border px-3 text-sm font-bold text-foreground"
                  >
                    <span className="flex items-center gap-2">
                      <Phone className="size-4 text-[#1F7A4D]" /> {card.phone}
                    </span>
                    <span className="text-[11px] font-extrabold text-[#1F7A4D]">Call</span>
                  </a>
                ) : null}
                {card.email ? (
                  <a
                    href={`mailto:${card.email}`}
                    className="flex min-h-11 items-center justify-between rounded-xl border border-border px-3 text-sm font-bold text-foreground"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Mail className="size-4 shrink-0 text-[#1F7A4D]" />
                      <span className="truncate">{card.email}</span>
                    </span>
                    <span className="text-[11px] font-extrabold text-[#1F7A4D]">Email</span>
                  </a>
                ) : null}
              </div>
            ) : (
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                {card.canViewContact
                  ? "This bidder has not added a phone number or email yet."
                  : "Contact details are private. Only the shop running this bidding can see them."}
              </p>
            )}
          </div>

          {/* Shops they run */}
          {card.shops.length > 0 ? (
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-wide text-[#6B7280]">
                <Store className="size-3.5 text-[#1F7A4D]" /> Also runs
              </p>
              <div className="mt-2 grid gap-2">
                {card.shops.map((shop) =>
                  shop.slug ? (
                    <Link
                      key={shop.id}
                      to="/b/$slug"
                      params={{ slug: shop.slug }}
                      className="flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-bold text-foreground"
                    >
                      <Avatar className="size-7">
                        {shop.logoUrl ? <AvatarImage src={shop.logoUrl} alt="" /> : null}
                        <AvatarFallback className="bg-[#EEF1F5] text-[10px] font-extrabold text-[#0B1F4D]">
                          {initials(shop.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate">{shop.name}</span>
                    </Link>
                  ) : (
                    <div
                      key={shop.id}
                      className={cn("flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-bold")}
                    >
                      <Store className="size-4 text-muted-foreground" />
                      <span className="truncate">{shop.name}</span>
                    </div>
                  ),
                )}
              </div>
            </div>
          ) : null}

          {postId ? (
            <Link
              to="/shop/bid/$postId"
              params={{ postId }}
              className="flex min-h-11 items-center justify-center rounded-2xl border border-border text-sm font-extrabold text-foreground"
            >
              Back to the bidding
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}
