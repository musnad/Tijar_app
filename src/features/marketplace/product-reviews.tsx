"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAccountGate } from "@/features/auth/account-gate";
import { useAuth } from "@/features/auth/auth-context";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import {
  deleteProductReview,
  fetchProductReviews,
  submitProductReview,
  type ProductReview,
} from "@/services/marketplace-service";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function StarRow({ value, size = "size-4" }: { value: number; size?: string }) {
  return (
    <span className="inline-flex" aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(size, n <= Math.round(value) ? "fill-primary text-primary" : "text-muted-foreground/35")}
        />
      ))}
    </span>
  );
}

export function ProductReviews({ productId }: { productId: string }) {
  const { profile } = useAuth();
  const { requireAccount } = useAccountGate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const query = useQuery({
    queryKey: ["product-reviews", productId],
    queryFn: () => fetchProductReviews(productId),
  });

  const reviews = query.data?.reviews ?? [];
  const summary = query.data?.summary ?? { average: null, count: 0 };
  const mine = profile ? reviews.find((r) => r.profile_id === profile.id) ?? null : null;

  function openForm(existing: ProductReview | null) {
    if (!requireAccount("comment") || !profile) return;
    haptic();
    setRating(existing?.rating ?? 5);
    setBody(existing?.body ?? "");
    setOpen(true);
  }

  async function save() {
    if (!profile) return;
    setBusy(true);
    const { error } = await submitProductReview({ productId, profileId: profile.id, rating, body });
    setBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(mine ? "Review updated" : "Thanks — your review is live.");
    setOpen(false);
    await queryClient.invalidateQueries({ queryKey: ["product-reviews", productId] });
  }

  async function remove() {
    if (!profile) return;
    if (!window.confirm("Delete your review?")) return;
    const { error } = await deleteProductReview({ productId, profileId: profile.id });
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Review deleted");
    await queryClient.invalidateQueries({ queryKey: ["product-reviews", productId] });
  }

  return (
    <section className="mt-5 border-t border-border pt-4" aria-label="Reviews">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-extrabold text-[color:var(--brand-navy,#001B3A)]">Reviews</h2>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-9 rounded-full px-3 text-[12px] font-bold"
          onClick={() => openForm(mine)}
        >
          {mine ? "Edit your review" : "Write a review"}
        </Button>
      </div>

      {summary.count > 0 && summary.average != null ? (
        <div className="mt-2 flex items-center gap-2">
          <StarRow value={summary.average} />
          <span className="text-[13px] font-bold text-[color:var(--brand-navy,#001B3A)]">
            {summary.average.toFixed(1)}
          </span>
          <span className="text-[12px] font-medium text-muted-foreground">
            · {summary.count} {summary.count === 1 ? "review" : "reviews"}
          </span>
        </div>
      ) : (
        <p className="mt-1 text-[12px] font-medium text-muted-foreground">
          No reviews yet — be the first to review this product.
        </p>
      )}

      {open ? (
        <div className="mt-3 rounded-2xl border border-border bg-muted/30 p-3">
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Your rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
                onClick={() => {
                  haptic();
                  setRating(n);
                }}
              >
                <Star className={cn("size-7", n <= rating ? "fill-primary text-primary" : "text-muted-foreground/40")} />
              </button>
            ))}
          </div>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Share what you think about this product (optional)"
            maxLength={600}
            className="mt-2 min-h-[4.5rem] rounded-xl bg-white"
          />
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              className="h-10 flex-1 rounded-full font-bold"
              disabled={busy}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : mine ? "Update review" : "Post review"}
            </Button>
            <Button type="button" variant="ghost" className="h-10 rounded-full" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {reviews.length > 0 ? (
        <ul className="mt-3 space-y-3">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-2xl border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-extrabold text-[color:var(--brand-navy,#001B3A)]">
                    {r.author_name ?? "Shopper"}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <StarRow value={r.rating} size="size-3.5" />
                    <span className="text-[11px] text-muted-foreground">{timeAgo(r.created_at)}</span>
                  </div>
                </div>
                {profile && r.profile_id === profile.id ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label="Edit your review"
                      className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                      onClick={() => openForm(r)}
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Delete your review"
                      className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                      onClick={() => void remove()}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ) : null}
              </div>
              {r.body ? (
                <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">{r.body}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {query.data?.error ? (
        <p className="mt-2 text-[11px] text-muted-foreground">{query.data.error}</p>
      ) : null}
    </section>
  );
}
