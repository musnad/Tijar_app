"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Gavel, Save, Share2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ShareSheet } from "@/components/share-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/auth-context";
import { usePrimaryBusiness } from "@/hooks/use-primary-business";
import { haptic } from "@/lib/haptics";
import { invalidateBusinessQueries } from "@/lib/invalidate-business-queries";
import { deleteVideoPost, fetchVideoPostById, updateVideoPost } from "@/services/bid-service";
import { PRODUCTION_ORIGIN } from "@/lib/site-url";
import { formatNgn } from "@/utils/money";

/** ISO timestamp → value for <input type="datetime-local">. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value → ISO string. */
function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function EditPostScreen({ postId }: { postId: string }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const businessQuery = usePrimaryBusiness(profile?.id);

  const postQuery = useQuery({
    queryKey: ["bid-post", postId],
    queryFn: () => fetchVideoPostById(postId),
  });
  const post = postQuery.data ?? null;
  const isBid = post?.post_type === "bid";

  const [caption, setCaption] = useState("");
  const [price, setPrice] = useState("");
  const [bidStarting, setBidStarting] = useState("");
  const [bidSaleLimit, setBidSaleLimit] = useState("");
  const [bidStartsAt, setBidStartsAt] = useState("");
  const [bidEndsAt, setBidEndsAt] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (!post) return;
    setCaption(post.caption ?? "");
    setPrice(post.price != null ? String(post.price) : "");
    setBidStarting(post.bid_starting_price != null ? String(post.bid_starting_price) : "");
    setBidSaleLimit(post.bid_sale_limit != null ? String(post.bid_sale_limit) : "");
    setBidStartsAt(toLocalInput(post.bid_starts_at));
    setBidEndsAt(toLocalInput(post.bid_ends_at));
  }, [post]);

  const isOwner = Boolean(profile?.id && post && businessQuery.data?.business?.id === post.business_id);
  const fromProfile =
    (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("from") === "profile") ||
    (typeof window !== "undefined" && sessionStorage.getItem("tijar-edit-return") === "profile");
  const afterEdit = fromProfile ? "/shop/profile" : "/shop";
  const shareUrl = `${PRODUCTION_ORIGIN}/shop`;

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["bid-post", postId] });
    const shopId = businessQuery.data?.business?.id;
    if (shopId) await invalidateBusinessQueries(queryClient, shopId);
    else {
      await queryClient.invalidateQueries({ queryKey: ["video-feed"] });
      await queryClient.invalidateQueries({ queryKey: ["seller-videos"] });
      await queryClient.invalidateQueries({ queryKey: ["own-profile-posts"] });
    }
  }

  async function save() {
    if (!post) return;
    if (isBid) {
      const start = Number(bidStarting.replace(/,/g, ""));
      const limit = Number(bidSaleLimit.replace(/,/g, ""));
      if (!(start > 0)) return void toast.error("Enter a starting price.");
      if (!(limit > 0)) return void toast.error("Enter the sale limit — the price that closes the bid.");
      if (limit < start) return void toast.error("Sale limit must be at least the starting price.");
      if (!bidStartsAt) return void toast.error("Choose when bidding starts.");
      if (!bidEndsAt) return void toast.error("Choose when bidding finishes.");
      if (new Date(bidEndsAt).getTime() <= new Date(bidStartsAt).getTime())
        return void toast.error("Finish time must be after the start time.");
    }
    setBusy("save");
    const r = await updateVideoPost(postId, {
      caption: caption.trim() || null,
      ...(isBid
        ? {
            bidStartingPrice: Number(bidStarting.replace(/,/g, "")),
            bidSaleLimit: Number(bidSaleLimit.replace(/,/g, "")),
            bidStartsAt: fromLocalInput(bidStartsAt),
            bidEndsAt: fromLocalInput(bidEndsAt),
          }
        : { price: price.trim() ? Number(price.replace(/,/g, "")) : null }),
    });
    setBusy(null);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    haptic("success");
    toast.success("Post updated.");
    await refresh();
    if (fromProfile && typeof window !== "undefined") sessionStorage.removeItem("tijar-edit-return");
    void navigate({ to: afterEdit });
  }

  async function remove() {
    setBusy("delete");
    const r = await deleteVideoPost(postId);
    setBusy(null);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    toast.success("Post deleted.");
    await refresh();
    if (fromProfile && typeof window !== "undefined") sessionStorage.removeItem("tijar-edit-return");
    void navigate({ to: afterEdit });
  }

  if (postQuery.isLoading) {
    return <p className="mt-10 text-center text-sm font-bold text-foreground">Loading…</p>;
  }
  if (!post) {
    return <p className="mt-10 text-center text-sm font-bold text-foreground">This post is no longer available.</p>;
  }
  if (businessQuery.isSuccess && !isOwner) {
    return <p className="mt-10 text-center text-sm font-bold text-foreground">Only the shop that posted this can edit it.</p>;
  }

  return (
    <div className="pb-10">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void navigate({ to: afterEdit })}
          className="flex size-9 items-center justify-center rounded-full border border-border"
          aria-label="Back"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div>
          <h1 className="text-lg font-extrabold text-foreground">Edit post</h1>
          <p className="text-xs text-muted-foreground">Change the words and the numbers. The photo/video stays.</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <label className="block text-[12px] font-bold text-muted-foreground">
          Caption
          <textarea
            className="mt-1 min-h-24 w-full rounded-xl border px-3 py-2 text-sm"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Say something about this post"
          />
        </label>

        {isBid ? (
          <>
            <p className="flex items-center gap-1.5 pt-1 text-[13px] font-extrabold text-foreground">
              <Gavel className="size-4 text-[#1F7A4D]" /> Bidding
            </p>
            <Input
              className="min-h-11 rounded-xl"
              inputMode="decimal"
              value={bidStarting}
              onChange={(e) => setBidStarting(e.target.value)}
              placeholder="Starting price in ₦"
            />
            <Input
              className="min-h-11 rounded-xl"
              inputMode="decimal"
              value={bidSaleLimit}
              onChange={(e) => setBidSaleLimit(e.target.value)}
              placeholder="Sale limit in ₦ — bid that closes it"
            />
            <label className="block text-[12px] font-bold text-muted-foreground">
              Bidding starts
              <Input
                className="mt-1 min-h-11 rounded-xl"
                type="datetime-local"
                value={bidStartsAt}
                onChange={(e) => setBidStartsAt(e.target.value)}
              />
            </label>
            <label className="block text-[12px] font-bold text-muted-foreground">
              Bidding finishes
              <Input
                className="mt-1 min-h-11 rounded-xl"
                type="datetime-local"
                value={bidEndsAt}
                onChange={(e) => setBidEndsAt(e.target.value)}
              />
            </label>
            <p className="text-[11px] text-muted-foreground">
              {post.bid_winner_name
                ? `This is sold to ${post.bid_winner_name}. Confirm or relist from the bidding page.`
                : `Sells instantly at ${bidSaleLimit ? formatNgn(Number(bidSaleLimit.replace(/,/g, ""))) : "—"}.`}
            </p>
          </>
        ) : (
          <label className="block text-[12px] font-bold text-muted-foreground">
            Price
            <Input
              className="mt-1 min-h-11 rounded-xl"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Price in ₦ (optional)"
            />
          </label>
        )}
      </div>

      <div className="mt-5 grid gap-2">
        <Button
          type="button"
          className="min-h-11 rounded-xl bg-[#1F7A4D] font-extrabold text-white hover:bg-[#1F7A4D]/90"
          disabled={busy != null}
          onClick={() => void save()}
        >
          <Save className="mr-2 size-4" /> {busy === "save" ? "Saving…" : "Save changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 rounded-xl"
          disabled={busy != null}
          onClick={() => setShareOpen(true)}
        >
          <Share2 className="mr-2 size-4" /> Share post
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 rounded-xl text-destructive"
          disabled={busy != null}
          onClick={() => void remove()}
        >
          <Trash2 className="mr-2 size-4" /> {busy === "delete" ? "Deleting…" : "Delete post"}
        </Button>
      </div>

      <ShareSheet
        open={shareOpen}
        onOpenChange={setShareOpen}
        title={`${post.business_name} on TIJAR`}
        text={post.caption?.trim() || (isBid ? "Bidding on TIJAR" : "New on TIJAR")}
        url={shareUrl}
      />
    </div>
  );
}
