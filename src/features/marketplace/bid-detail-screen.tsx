"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  BadgeCheck,
  Banknote,
  ChevronRight,
  Gavel,
  Mail,
  Pause,
  Pencil,
  Phone,
  Play,
  ShoppingBag,
  Trash2,
  Trophy,
  UserRound,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/auth-context";
import { usePrimaryBusiness } from "@/hooks/use-primary-business";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import {
  bidPhase,
  bidPaymentSecondsLeft,
  closeBid,
  confirmBidPayment,
  deleteVideoPost,
  fetchBidderCard,
  fetchBidOffers,
  fetchVideoPostById,
  pauseBid,
  placeBid,
  releaseBidUnpaid,
  resumeBid,
  type BidOffer,
} from "@/services/bid-service";
import { PaidShopContact } from "@/features/marketplace/paid-shop-contact";
import { ShopPayPanel } from "@/features/marketplace/shop-pay-panel";
import { isImagePost, resolvePostGallery } from "@/services/video-feed-service";
import { formatNgn } from "@/utils/money";

const PHASE_LABEL: Record<string, { label: string; cls: string }> = {
  open: { label: "Live", cls: "bg-[#1F7A4D] text-white" },
  upcoming: { label: "Starts soon", cls: "bg-[#EEF1F5] text-[#0B1F4D]" },
  paused: { label: "Stopped", cls: "bg-amber-500 text-white" },
  ended: { label: "Ended", cls: "bg-[#EEF1F5] text-[#6B7280]" },
  closed: { label: "Closed", cls: "bg-[#EEF1F5] text-[#6B7280]" },
  sold: { label: "Sold", cls: "bg-[#0B1F4D] text-white" },
  paid: { label: "Paid", cls: "bg-[#1F7A4D] text-white" },
};

function useTicker(active: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return tick;
}

function secondsTo(target: string | null | undefined): number {
  if (!target) return 0;
  const ms = new Date(target).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 1000) : 0;
}

function fmtDuration(secs: number): string {
  if (secs <= 0) return "0s";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(ms / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** A big, bold, ticking clock — the number everyone watches. */
function LiveCountdown({ label, secs }: { label: string; secs: number }) {
  const danger = secs > 0 && secs <= 60;
  return (
    <div className="text-right">
      <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">{label}</p>
      <p
        className={cn(
          "font-black tabular-nums leading-tight tracking-tight",
          danger ? "text-2xl text-red-600" : "text-2xl text-[#0B1F4D]",
        )}
      >
        {fmtDuration(secs)}
      </p>
    </div>
  );
}

function BidderLink({
  postId,
  bidderId,
  className,
  children,
}: {
  postId: string;
  bidderId: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link to="/shop/u/$profileId" params={{ profileId: bidderId }} search={{ post: postId }} className={className}>
      {children}
    </Link>
  );
}

export function BidDetailScreen({ postId }: { postId: string }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const businessQuery = usePrimaryBusiness(profile?.id);

  const postQuery = useQuery({
    queryKey: ["bid-post", postId],
    queryFn: () => fetchVideoPostById(postId),
    refetchInterval: 20_000,
  });
  const offersQuery = useQuery({
    queryKey: ["bid-offers", postId],
    queryFn: () => fetchBidOffers(postId),
    refetchInterval: 8_000,
  });

  const post = postQuery.data ?? null;
  const offers = offersQuery.data ?? [];
  const phase = post ? bidPhase(post) : "open";
  const isOwner = Boolean(profile?.id && post && businessQuery.data?.business?.id === post.business_id);
  const isWinner = Boolean(profile?.id && post?.bid_winner_id === profile.id);

  const starting = post?.bid_starting_price != null ? Number(post.bid_starting_price) : 0;
  const limit = post?.bid_sale_limit != null ? Number(post.bid_sale_limit) : null;
  const topOffer = offers[0] ?? null;
  const topBid = topOffer ? topOffer.amount : post?.top_bid != null ? Number(post.top_bid) : null;
  const minNext = Math.max(topBid != null ? topBid + 1 : starting, starting);

  const myBest = useMemo(() => {
    if (!profile?.id) return null;
    const mine = offers.filter((o) => o.bidder_id === profile.id);
    return mine.length ? mine[0] : null;
  }, [offers, profile?.id]);
  const iAmWinning = Boolean(myBest && topOffer && myBest.id === topOffer.id);

  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const winnerId = post?.bid_winner_id ?? null;
  const winnerCardQuery = useQuery({
    queryKey: ["bidder-card", postId, winnerId ?? ""],
    enabled: Boolean(winnerId),
    queryFn: () => fetchBidderCard(postId, winnerId as string),
  });
  const winnerCard = winnerCardQuery.data ?? null;

  useTicker(phase === "open" || phase === "upcoming" || phase === "sold");

  if (postQuery.isLoading) {
    return <p className="mt-8 text-center text-sm text-muted-foreground">Loading bidding…</p>;
  }
  if (!post) {
    return (
      <div className="mt-10 text-center">
        <p className="text-sm font-bold text-foreground">This bidding is no longer available.</p>
        <Link to="/shop" className="mt-3 inline-block text-sm font-extrabold text-primary">
          Back to feed
        </Link>
      </div>
    );
  }

  const chip = PHASE_LABEL[phase] ?? PHASE_LABEL["open"]!;
  const gallery = resolvePostGallery(post);
  const isImage = isImagePost(post) || gallery.length > 0;
  const productId = post.product_ids?.[0] ?? null;

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["bid-post", postId] });
    await queryClient.invalidateQueries({ queryKey: ["bid-offers", postId] });
    await queryClient.invalidateQueries({ queryKey: ["video-feed"] });
    await queryClient.invalidateQueries({ queryKey: ["marketplace-products"] });
  }

  async function submitBid() {
    const value = Number(amount.replace(/,/g, ""));
    if (!(value > 0)) {
      toast.error("Enter a bid amount.");
      return;
    }
    setBusy("bid");
    const r = await placeBid(postId, value);
    setBusy(null);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    setAmount("");
    haptic("success");
    toast.success("Bid placed. Good luck!");
    await refresh();
  }

  async function control(action: "pause" | "resume" | "close" | "paid" | "release" | "delete") {
    setBusy(action);
    try {
      if (action === "pause" || action === "resume") {
        const r = action === "pause" ? await pauseBid(postId) : await resumeBid(postId);
        if (r.error) return void toast.error(r.error);
        toast.success(action === "pause" ? "Bidding stopped." : "Bidding resumed.");
      } else if (action === "close") {
        const r = await closeBid(postId);
        if (r.error) return void toast.error(r.error);
        toast.success(
          r.sold
            ? `Closed — sold to ${r.winnerName ?? "the top bidder"}.`
            : "Bidding closed. Nobody had bid.",
        );
      } else if (action === "paid") {
        const r = await confirmBidPayment(postId);
        if (r.error) return void toast.error(r.error);
        toast.success("Payment confirmed. Money received.");
      } else if (action === "release") {
        const r = await releaseBidUnpaid(postId);
        if (r.error) return void toast.error(r.error);
        toast.success("Marked unpaid. The item is back on the market.");
      } else {
        const r = await deleteVideoPost(postId);
        if (r.error) return void toast.error(r.error);
        toast.success("Post deleted.");
        await refresh();
        void navigate({ to: "/shop" });
        return;
      }
      haptic("success");
      await refresh();
    } finally {
      setBusy(null);
    }
  }


  return (
    <div className="pb-8">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void navigate({ to: "/shop" })}
          className="flex size-9 items-center justify-center rounded-full border border-border"
          aria-label="Back"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-extrabold text-foreground">Bidding</h1>
          <p className="truncate text-xs text-muted-foreground">{post.business_name}</p>
        </div>
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide",
            chip.cls,
          )}
        >
          {phase === "open" ? <span className="size-1.5 animate-pulse rounded-full bg-white" /> : null}
          {chip.label}
        </span>
      </div>

      {/* Media + caption */}
      <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-black/5">
        {isImage && gallery[0] ? (
          <img src={gallery[0]} alt="" className="max-h-72 w-full object-cover" />
        ) : post.playback_url ? (
          <video src={post.playback_url} controls playsInline className="max-h-72 w-full bg-black object-cover" />
        ) : (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Play className="size-6" />
          </div>
        )}
      </div>
      {post.caption ? <p className="mt-3 whitespace-pre-line text-sm text-foreground">{post.caption}</p> : null}

      {/* Live stats */}
      <div className="mt-4 rounded-2xl border border-[#E5E7EB] bg-[#F8FAF9] p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
              {topBid != null ? "Highest bid" : "Starting price"}
            </p>
            <p className="text-2xl font-black text-[#1F7A4D]">{formatNgn(topBid ?? starting)}</p>
          </div>
          <div className="text-right">
            {phase === "upcoming" ? (
              <LiveCountdown label="Starts in" secs={secondsTo(post.bid_starts_at)} />
            ) : phase === "open" ? (
              <LiveCountdown label="Ends in" secs={secondsTo(post.bid_ends_at)} />
            ) : phase === "sold" ? (
              <LiveCountdown label="Pay within" secs={bidPaymentSecondsLeft(post)} />
            ) : null}
          </div>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
          <div className="rounded-xl bg-white px-3 py-2">
            <dt className="text-[#6B7280]">Starting price</dt>
            <dd className="font-extrabold text-[#0B1F4D]">{formatNgn(starting)}</dd>
          </div>
          <div className="rounded-xl bg-white px-3 py-2">
            <dt className="text-[#6B7280]">Sale limit</dt>
            <dd className="font-extrabold text-[#0B1F4D]">{limit != null ? formatNgn(limit) : "—"}</dd>
          </div>
          <div className="rounded-xl bg-white px-3 py-2">
            <dt className="text-[#6B7280]">Bids</dt>
            <dd className="font-extrabold text-[#0B1F4D]">{offers.length}</dd>
          </div>
          <div className="rounded-xl bg-white px-3 py-2">
            <dt className="text-[#6B7280]">Sells at</dt>
            <dd className="font-extrabold text-[#0B1F4D]">{limit != null ? formatNgn(limit) : "—"}</dd>
          </div>
        </dl>

        <p className="mt-3 text-[11px] leading-relaxed text-[#6B7280]">
          The moment a bid reaches the sale limit, bidding closes and the item is sold instantly. If nobody reaches
          it by the finish time, nothing is sold.
        </p>

        {myBest ? (
          <p
            className={cn(
              "mt-3 rounded-xl px-3 py-2 text-[12px] font-bold",
              iAmWinning ? "bg-[#E9F7EF] text-[#1F7A4D]" : "bg-amber-50 text-amber-700",
            )}
          >
            {phase === "sold" || phase === "paid"
              ? iAmWinning
                ? "You won this bidding."
                : "Bidding closed — someone else won."
              : iAmWinning
                ? `You are winning at ${formatNgn(myBest.amount)}.`
                : `You were outbid. Your last bid was ${formatNgn(myBest.amount)}.`}
          </p>
        ) : null}
      </div>

      {/* Sold / payment */}
      {(phase === "sold" || phase === "paid") && post.bid_winner_name ? (
        <div className="mt-4 rounded-2xl border border-[#0B1F4D]/15 bg-[#0B1F4D] p-4 text-white">
          <p className="flex items-center gap-2 text-[13px] font-extrabold">
            <Trophy className="size-4 text-amber-300" /> Sold to {post.bid_winner_name}
          </p>
          <p className="mt-1 text-2xl font-black tabular-nums">{formatNgn(topBid ?? starting)}</p>
          {phase === "sold" ? (
            <p className="mt-2 text-[12px] text-white/80">
              {bidPaymentSecondsLeft(post) > 0
                ? post.bid_buyer_marked_paid_at
                  ? "The winner says they have paid — confirm to finish."
                  : `Waiting for payment — ${fmtDuration(bidPaymentSecondsLeft(post))} left.`
                : "The 5-minute payment window has passed."}
            </p>
          ) : (
            <p className="mt-2 text-[12px] text-emerald-200">Paid — money received.</p>
          )}

          {post.bid_winner_id ? (
            <BidderLink
              postId={postId}
              bidderId={post.bid_winner_id}
              className="mt-3 flex items-center justify-between rounded-xl bg-white/10 px-3 py-2 text-[12px] font-extrabold"
            >
              <span className="flex items-center gap-2">
                <UserRound className="size-3.5 text-amber-200" />
                {isOwner ? "Open the winner's account" : "View the winner's account"}
              </span>
              <ChevronRight className="size-4" />
            </BidderLink>
          ) : null}

          {isOwner && (winnerCard?.phone || winnerCard?.email) ? (
            <div className="mt-2 grid gap-1.5 text-[12px] font-bold">
              {winnerCard?.phone ? (
                <a href={`tel:${winnerCard.phone}`} className="flex items-center gap-2 text-amber-200">
                  <Phone className="size-3.5" /> {winnerCard.phone}
                </a>
              ) : null}
              {winnerCard?.email ? (
                <a href={`mailto:${winnerCard.email}`} className="flex items-center gap-2 break-all text-amber-200">
                  <Mail className="size-3.5 shrink-0" /> {winnerCard.email}
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Place a bid — buyers only */}
      {phase === "open" && !isOwner ? (
        <div className="mt-4 rounded-2xl border border-border p-3">
          <p className="text-[13px] font-extrabold text-foreground">Place your bid</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Minimum {formatNgn(minNext)}
            {topBid != null ? ` · current highest ${formatNgn(topBid)}` : ""}
          </p>
          <div className="mt-2 flex gap-2">
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={formatNgn(minNext)}
              className="min-h-11 flex-1 rounded-xl"
            />
            <Button
              type="button"
              className="min-h-11 rounded-xl bg-[#1F7A4D] px-5 font-extrabold text-white hover:bg-[#1F7A4D]/90"
              disabled={busy === "bid"}
              onClick={() => void submitBid()}
            >
              {busy === "bid" ? "Placing…" : "Bid"}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Winner: pay the shop */}
      {isWinner && (phase === "sold" || phase === "paid") ? (
        phase === "paid" || post.bid_buyer_marked_paid_at ? (
          <div className="mt-4 space-y-3">
            <p className="rounded-2xl bg-[#1F7A4D]/10 px-3 py-3 text-center text-sm font-extrabold text-[#1F7A4D]">
              Paid
            </p>
            <PaidShopContact
              businessId={post.business_id}
              orderRef={post.id}
              items={post.caption?.trim() || "winning bid"}
              amount={Number(post.top_bid ?? post.bid_starting_price ?? 0)}
            />
          </div>
        ) : (
          <ShopPayPanel
            businessId={post.business_id}
            amount={Number(post.top_bid ?? post.bid_starting_price ?? 0)}
            orderId={post.id}
            kind="bid"
            itemLabel={post.caption?.trim() || "winning bid"}
            onPaid={() => void refresh()}
          />
        )
      ) : null}

      {/* Control room — shop only */}
      {isOwner ? (
        <div className="mt-4 rounded-2xl border border-[#0B1F4D]/20 bg-[#F4F7FB] p-4">
          <p className="flex items-center gap-2 text-[13px] font-extrabold text-[#0B1F4D]">
            <Gavel className="size-4 text-[#1F7A4D]" /> Control room
          </p>

          <div className="mt-3 grid gap-2">
            {phase === "open" ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 justify-start rounded-xl"
                disabled={busy != null}
                onClick={() => void control("pause")}
              >
                <Pause className="mr-2 size-4" /> Stop bidding
              </Button>
            ) : null}
            {phase === "paused" ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 justify-start rounded-xl"
                disabled={busy != null}
                onClick={() => void control("resume")}
              >
                <Play className="mr-2 size-4" /> Resume bidding
              </Button>
            ) : null}
            {(phase === "open" || phase === "paused") ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 justify-start rounded-xl border-[#0B1F4D]/30 text-[#0B1F4D]"
                disabled={busy != null}
                onClick={() => void control("close")}
              >
                <BadgeCheck className="mr-2 size-4" /> Close now — sell to the highest bidder
              </Button>
            ) : null}
            <Link
              to="/shop/post/$postId/edit"
              params={{ postId }}
              className="flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-semibold"
            >
              <Pencil className="mr-2 size-4" /> Edit post
            </Link>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 justify-start rounded-xl text-destructive"
              disabled={busy != null}
              onClick={() => void control("delete")}
            >
              <Trash2 className="mr-2 size-4" /> Delete post
            </Button>
          </div>

          {phase === "sold" ? (
            <div className="mt-3 rounded-xl border border-[#1F7A4D]/25 bg-white p-3">
              <p className="flex items-center gap-2 text-[12px] font-extrabold text-[#0B1F4D]">
                <Wallet className="size-4 text-[#1F7A4D]" /> Receive money
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Winner: {post.bid_winner_name ?? "—"} · {formatNgn(topBid ?? starting)}
                {post.bid_buyer_marked_paid_at ? " · they say they have paid" : " · not marked paid yet"}
              </p>
              {post.bid_winner_id ? (
                <BidderLink
                  postId={postId}
                  bidderId={post.bid_winner_id}
                  className="mt-2 flex items-center justify-between rounded-xl border border-[#0B1F4D]/15 bg-white px-3 py-2 text-[12px] font-extrabold text-[#0B1F4D]"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <UserRound className="size-3.5 shrink-0 text-[#1F7A4D]" />
                    <span className="truncate">
                      Winner&apos;s account
                      {winnerCard?.phone ? ` · ${winnerCard.phone}` : ""}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0" />
                </BidderLink>
              ) : null}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  className="min-h-10 rounded-xl bg-[#1F7A4D] text-xs font-extrabold text-white hover:bg-[#1F7A4D]/90"
                  disabled={busy != null}
                  onClick={() => void control("paid")}
                >
                  {busy === "paid" ? "Saving…" : "Confirm payment"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-10 rounded-xl text-xs font-extrabold"
                  disabled={busy != null}
                  onClick={() => void control("release")}
                >
                  {busy === "release" ? "Working…" : "Not paid — relist"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Transparent bid history */}
      <div className="mt-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-foreground">All bids</h2>
          <span className="text-[11px] text-muted-foreground">
            {offers.length} {offers.length === 1 ? "bid" : "bids"}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Everyone can see the bids. Highest bid wins; ties go to the earlier bid.
        </p>

        {offers.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-border p-4 text-center text-[13px] text-muted-foreground">
            No bids yet. Be the first.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {offers.map((offer, index) => (
              <BidRow
                key={offer.id}
                postId={postId}
                offer={offer}
                rank={index + 1}
                isTop={index === 0}
                isMine={offer.bidder_id === profile?.id}
              />
            ))}
          </ul>
        )}
      </div>

      {productId ? (
        <Link
          to="/shop/buy"
          search={{ productId }}
          className="mt-5 flex min-h-12 items-center justify-between rounded-2xl border border-border px-4 text-sm font-extrabold text-foreground"
        >
          <span className="flex items-center gap-2">
            <ShoppingBag className="size-4 text-[#1F7A4D]" /> View the item
          </span>
          <ChevronRight className="size-4" />
        </Link>
      ) : null}

      <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <Banknote className="size-3.5" /> Bidding closes automatically at the sale limit or the finish time.
      </p>
    </div>
  );
}

function BidRow({
  postId,
  offer,
  rank,
  isTop,
  isMine,
}: {
  postId: string;
  offer: BidOffer;
  rank: number;
  isTop: boolean;
  isMine: boolean;
}) {
  return (
    <li>
      <Link
        to="/shop/u/$profileId"
        params={{ profileId: offer.bidder_id }}
        search={{ post: postId }}
        className={cn(
          "flex items-center gap-3 rounded-2xl border p-3",
          isTop ? "border-[#1F7A4D]/30 bg-[#E9F7EF]" : "border-border bg-card",
        )}
      >
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold",
            isTop ? "bg-[#1F7A4D] text-white" : "bg-muted text-muted-foreground",
          )}
        >
          {rank}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[13px] font-extrabold text-foreground">
            <span className="truncate">{isMine ? `${offer.bidder_name} (you)` : offer.bidder_name}</span>
            {isTop ? (
              <span className="rounded-full bg-[#1F7A4D] px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-white">
                Winning
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            {timeAgo(offer.created_at)}
            {isMine ? "" : " · tap to view account"}
          </span>
        </span>
        <span className="shrink-0 text-sm font-black text-[#0B1F4D]">{formatNgn(offer.amount)}</span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}

