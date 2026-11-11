"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, Copy, Headphones, Megaphone, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { NativePageHeader, nativeCanvasClass } from "@/features/marketplace/native-page-header";
import { ProductPhotosField, type ProductPhotoItem } from "@/features/products/product-photos-field";
import { useAuth } from "@/features/auth/auth-context";
import { usePrimaryBusiness } from "@/hooks/use-primary-business";
import { AD_OBJECTIVES, AD_PACKAGES, type AdObjective, type AdSourceKind } from "@/lib/ads/packages";
import { isTijarSuperAdminEmail } from "@/lib/admin";
import { cn } from "@/lib/utils";
import {
  confirmAdPayment,
  controlSponsoredAd,
  createSponsoredAd,
  fetchAdsPayAccount,
  fetchAdSupportTickets,
  fetchAllAdsAdmin,
  fetchMyAds,
  markAdReadyToPay,
  publishAdAsAdmin,
  submitAdSupportTicket,
  updateAdSupportTicket,
  type AdsTicketStatus,
  type SponsoredAd,
  type SponsoredAdTicket,
} from "@/services/ads-service";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchPostsForBusiness } from "@/services/video-feed-service";
import { listProducts } from "@/services/product-service";
import { formatNgn } from "@/utils/money";

const WINDOW_MS = 15 * 60 * 1000;
const MISMATCH =
  "No matching transfer on the TIJAR ads account yet. Send the exact amount, wait a moment, then tap I’ve paid.";
const TICKET_STATUSES: { id: AdsTicketStatus; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "attended", label: "Attended" },
  { id: "resolved", label: "Resolved" },
  { id: "closed", label: "Closed" },
];

function timerKey(adId: string) {
  return `tijar-ads-pay-timer-${adId}`;
}

function remainingMs(adId: string): number {
  if (typeof window === "undefined") return 0;
  const raw = sessionStorage.getItem(timerKey(adId));
  if (!raw) return 0;
  const started = Number(raw);
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, started + WINDOW_MS - Date.now());
}

function formatClock(ms: number) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function startTimer(adId: string) {
  if (!sessionStorage.getItem(timerKey(adId))) {
    sessionStorage.setItem(timerKey(adId), String(Date.now()));
  }
}

export function AdsManagerScreen({ adminMode = false, embedded = false }: { adminMode?: boolean; embedded?: boolean }) {
  const { profile, session } = useAuth();
  const shopQuery = usePrimaryBusiness(profile?.id);
  const shop = shopQuery.data?.business;
  const queryClient = useQueryClient();
  const isAdmin = adminMode || isTijarSuperAdminEmail(profile?.email);
  const [creating, setCreating] = useState(false);
  const [objective, setObjective] = useState<AdObjective>("sales");
  const [source, setSource] = useState<AdSourceKind>("flyer");
  const [hours, setHours] = useState(24);
  const [caption, setCaption] = useState("");
  const [destination, setDestination] = useState("");
  const [flyer, setFlyer] = useState<ProductPhotoItem[]>([]);
  const [postId, setPostId] = useState("");
  const [productId, setProductId] = useState("");
  const [busy, setBusy] = useState(false);
  const [payAd, setPayAd] = useState<SponsoredAd | null>(null);
  const [adminShopId, setAdminShopId] = useState("");
  const [tab, setTab] = useState<"pending" | "live" | "drafts" | "ended" | "support">("pending");

  const businessId = adminMode ? adminShopId || shop?.id || "" : shop?.id || "";

  const adsQuery = useQuery({
    queryKey: ["sponsored-ads", adminMode ? "admin" : businessId],
    enabled: adminMode || Boolean(businessId),
    refetchInterval: adminMode ? 8_000 : 20_000,
    queryFn: async () => (adminMode ? fetchAllAdsAdmin() : fetchMyAds(businessId)),
  });
  const postsQuery = useQuery({
    queryKey: ["ads-posts", businessId],
    enabled: Boolean(businessId),
    queryFn: async () => fetchPostsForBusiness(businessId),
  });
  const productsQuery = useQuery({
    queryKey: ["ads-products", businessId],
    enabled: Boolean(businessId),
    queryFn: async () => (await listProducts(businessId)).data.filter((p) => Boolean(p.image_url)),
  });
  const shopsQuery = useQuery({
    queryKey: ["ads-admin-shops"],
    enabled: adminMode,
    queryFn: async () => {
      const { data } = await getSupabaseBrowserClient()
        .from("businesses")
        .select("id, business_name")
        .eq("is_published", true)
        .order("business_name")
        .limit(200);
      return data ?? [];
    },
  });

  const pack = AD_PACKAGES.find((p) => p.hours === hours)!;
  const ads = adsQuery.data?.ads ?? [];
  const pending = ads.filter((a) => a.status === "pending_payment");
  const drafts = ads.filter((a) => a.status === "draft");
  const live = ads.filter((a) => a.status === "live" || a.status === "paused");
  const ended = ads.filter((a) => a.status === "ended" || a.status === "cancelled");
  const totals = useMemo(
    () =>
      ads.reduce(
        (n, a) => ({
          views: n.views + a.views_count,
          people: n.people + a.unique_viewers,
          likes: n.likes + a.likes_count,
          follows: n.follows + a.follows_count,
          buys: n.buys + a.buys_count,
          calls: n.calls + a.calls_count,
        }),
        { views: 0, people: 0, likes: 0, follows: 0, buys: 0, calls: 0 },
      ),
    [ads],
  );

  const ticketsQuery = useQuery({
    queryKey: ["sponsored-ad-tickets"],
    enabled: adminMode,
    refetchInterval: 8_000,
    queryFn: fetchAdSupportTickets,
  });
  const tickets = ticketsQuery.data?.tickets ?? [];
  const openTickets = tickets.filter((t) => t.status === "open" || t.status === "attended").length;


  async function submit(asDraft: boolean) {
    if (!session || !profile) {
      toast.error("Sign in to run ads.");
      return;
    }
    if (!businessId) {
      toast.error(adminMode ? "Pick a shop." : "Create a shop first.");
      return;
    }
    setBusy(true);
    const created = await createSponsoredAd({
      businessId,
      profileId: profile.id,
      sourceKind: source,
      objective,
      durationHours: hours,
      caption,
      destinationUrl: destination,
      videoPostId: source === "post" ? postId : null,
      productId: source === "product" ? productId : null,
      flyer: source === "flyer" ? flyer[0]?.file ?? null : null,
      createdByAdmin: isAdmin && adminMode,
      asDraft,
    });
    setBusy(false);
    if (created.error || !created.ad) {
      toast.error(created.error ?? "Could not create the ad.");
      return;
    }
    setCreating(false);
    setCaption("");
    setFlyer([]);
    await queryClient.invalidateQueries({ queryKey: ["sponsored-ads"] });
    if (asDraft) {
      setTab("drafts");
      toast.success("Draft saved. Finish and pay whenever you are ready.");
      return;
    }
    setTab("pending");
    setPayAd(created.ad);
    toast.success(adminMode ? "Campaign is pending. Pay or publish it from the list." : "Transfer the exact amount to go live.");
  }

  async function openPay(ad: SponsoredAd) {
    if (ad.status === "draft") {
      const ready = await markAdReadyToPay(ad.id);
      if (ready.error) {
        toast.error(ready.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["sponsored-ads"] });
      setPayAd({ ...ad, status: "pending_payment" });
      setTab("pending");
      return;
    }
    setPayAd(ad);
  }

  async function control(ad: SponsoredAd, action: "pause" | "resume" | "stop" | "delete") {
    const confirmMsg =
      action === "delete"
        ? "Delete this campaign? It will leave the ads list."
        : action === "stop"
          ? "Stop this campaign now? It will leave the feed."
          : action === "pause"
            ? "Pause this ad? It leaves the feed until you resume."
            : "Put this ad back on the feed?";
    if (typeof window !== "undefined" && !window.confirm(confirmMsg)) return;
    const result = await controlSponsoredAd(ad.id, action);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (payAd?.id === ad.id) setPayAd(null);
    toast.success(action === "delete" ? "Deleted." : action === "stop" ? "Stopped." : action === "pause" ? "Paused." : "Live again.");
    await queryClient.invalidateQueries({ queryKey: ["sponsored-ads"] });
  }

  const shown = tab === "pending" ? pending : tab === "live" ? live : tab === "drafts" ? drafts : ended;

  const body = (
    <>
      <section className="relative mt-3 overflow-hidden rounded-[28px] bg-gradient-to-br from-[#0B1F4D] via-[#12356E] to-[#1F7A4D] p-5 text-white shadow-lg">
        <Sparkles className="absolute -right-3 -top-3 size-24 text-white/10" />
        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-white/70">
          {adminMode ? "Platform ads" : "Grow the shop"}
        </p>
        <h2 className="mt-1 text-2xl font-extrabold tracking-tight">Ads manager</h2>
        <p className="mt-2 max-w-[34ch] text-[13px] leading-relaxed text-white/85">
          Promote a flyer, post, or product. Same prices for every category. Pay into the TIJAR virtual account — we go live after the transfer, and the ad stops on the date you pick.
        </p>
      </section>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="People shown" value={String(totals.people)} />
        <Stat label="Views" value={String(totals.views)} />
        <Stat label="Likes" value={String(totals.likes)} />
        <Stat label="Follows" value={String(totals.follows)} />
        <Stat label="Calls" value={String(totals.calls)} />
        <Stat label="Buys" value={String(totals.buys)} />
      </div>

      {payAd ? (
        <AdsPayPanel
          ad={payAd}
          adminMode={adminMode}
          profileId={profile?.id ?? ""}
          defaultName={profile?.full_name ?? ""}
          defaultPhone={profile?.phone ?? ""}
          onClose={() => setPayAd(null)}
          onPaid={async () => {
            setPayAd(null);
            await queryClient.invalidateQueries({ queryKey: ["sponsored-ads"] });
          }}
        />
      ) : null}

      {!creating ? (
        <Button className="mt-5 min-h-12 w-full rounded-2xl bg-[#0B1F4D] text-[15px] font-extrabold shadow-md" onClick={() => setCreating(true)}>
          <Megaphone className="mr-2 size-4" /> Create ad
        </Button>
      ) : (
        <section className="mt-5 space-y-4 rounded-[28px] border border-white/60 bg-white/90 p-4 shadow-sm ring-1 ring-black/5">
          {adminMode ? (
            <label className="block text-sm font-extrabold">
              Shop
              <select className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3 text-sm font-semibold" value={adminShopId} onChange={(e) => setAdminShopId(e.target.value)}>
                <option value="">Pick a shop</option>
                {(shopsQuery.data ?? []).map((s) => (
                  <option key={String(s.id)} value={String(s.id)}>
                    {String(s.business_name)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <p className="text-sm font-extrabold">What should this ad get you?</p>
          <div className="grid grid-cols-2 gap-2">
            {AD_OBJECTIVES.map((item) => (
              <button key={item.id} type="button" onClick={() => setObjective(item.id)} className={cn("rounded-2xl border px-3 py-3 text-left transition", objective === item.id ? "border-[#1F7A4D] bg-[#F4FBF7] shadow-sm" : "border-border bg-card")}>
                <span className="block text-[13px] font-extrabold">{item.label}</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">{item.hint}</span>
              </button>
            ))}
          </div>

          <p className="text-sm font-extrabold">Promote</p>
          <div className="grid grid-cols-3 gap-2">
            {([
              ["flyer", "Flyer"],
              ["post", "Post"],
              ["product", "Product"],
            ] as const).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setSource(id)} className={cn("min-h-11 rounded-xl border text-[13px] font-extrabold", source === id ? "border-[#1F7A4D] bg-[#1F7A4D] text-white" : "border-border bg-card")}>
                {label}
              </button>
            ))}
          </div>
          {source === "flyer" ? <ProductPhotosField photos={flyer} onChange={setFlyer} required={false} /> : null}
          {source === "post" ? (
            <select className="min-h-11 w-full rounded-xl border px-3 text-sm" value={postId} onChange={(e) => setPostId(e.target.value)}>
              <option value="">Pick a post</option>
              {(postsQuery.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {(p.caption || "Post").slice(0, 48)}
                </option>
              ))}
            </select>
          ) : null}
          {source === "product" ? (
            <select className="min-h-11 w-full rounded-xl border px-3 text-sm" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Pick a product</option>
              {(productsQuery.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : null}

          <label className="block text-sm font-extrabold">
            Caption
            <Input className="mt-1 min-h-11 rounded-xl" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="What should people see?" />
          </label>
          <label className="block text-sm font-extrabold">
            Click destination (optional)
            <Input className="mt-1 min-h-11 rounded-xl" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="https://…" />
          </label>

          <p className="text-sm font-extrabold">How long — same fee for every category</p>
          <div className="space-y-2">
            {AD_PACKAGES.map((item) => (
              <button key={item.hours} type="button" onClick={() => setHours(item.hours)} className={cn("flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left", hours === item.hours ? "border-[#1F7A4D] bg-[#F4FBF7]" : "border-border bg-card")}>
                <span>
                  <span className="block text-sm font-extrabold">{item.label}</span>
                  <span className="text-[11px] text-muted-foreground">{item.blurb}</span>
                </span>
                <span className="text-sm font-extrabold text-[#1F7A4D]">{formatNgn(item.amount)}</span>
              </button>
            ))}
          </div>

          <Button className="min-h-12 w-full rounded-2xl bg-[#1F7A4D] font-extrabold" disabled={busy} onClick={() => void submit(false)}>
            {busy ? "Saving…" : `Continue to pay · ${formatNgn(pack.amount)}`}
          </Button>
          <Button variant="outline" className="min-h-11 w-full rounded-2xl font-bold" disabled={busy} onClick={() => void submit(true)}>
            Save as draft
          </Button>
          <button type="button" className="w-full text-sm font-bold text-muted-foreground" onClick={() => setCreating(false)}>
            Cancel
          </button>
        </section>
      )}

      {adminMode && pending.length ? (
        <p className="mt-6 rounded-2xl bg-amber-50 px-3 py-2 text-[12px] font-bold text-amber-900">
          {pending.length} campaign{pending.length === 1 ? "" : "s"} waiting for payment — they appear here as soon as they are created.
        </p>
      ) : null}
      {adminMode && openTickets ? (
        <button
          type="button"
          className="mt-2 w-full rounded-2xl bg-[#0B1F4D] px-3 py-2 text-left text-[12px] font-bold text-white"
          onClick={() => setTab("support")}
        >
          {openTickets} payment complaint{openTickets === 1 ? "" : "s"} waiting for you.
        </button>
      ) : null}

      <div className="mt-6 flex gap-1 overflow-x-auto pb-1">
        {([
          ["pending", `Pay · ${pending.length}`],
          ["live", `Live · ${live.length}`],
          ["drafts", `Drafts · ${drafts.length}`],
          ["ended", `Ended · ${ended.length}`],
          ...(adminMode ? [["support", `Support · ${tickets.length}`]] : []),
        ] as [typeof tab, string][]).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-[12px] font-extrabold",
              tab === id ? "bg-[#0B1F4D] text-white" : "bg-muted text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "support" && adminMode ? (
        <AdminTicketsList
          tickets={tickets}
          onStatus={async (id, status) => {
            const result = await updateAdSupportTicket(id, status);
            if (result.error) toast.error(result.error);
            else await queryClient.invalidateQueries({ queryKey: ["sponsored-ad-tickets"] });
          }}
        />
      ) : (
      <ul className="mt-3 space-y-2">
        {shown.map((ad) => (
          <li key={ad.id} className="rounded-[22px] border border-border/80 bg-white p-3.5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-extrabold">{ad.caption || "Paid ad"}</p>
                <p className="text-[11px] text-muted-foreground">
                  {ad.shop_name ? `${ad.shop_name} · ` : ""}
                  {ad.objective} · {ad.duration_hours / 24} day{ad.duration_hours === 24 ? "" : "s"} · {formatNgn(ad.amount_ngn)}
                </p>
              </div>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase",
                  ad.status === "live"
                    ? "bg-[#1F7A4D] text-white"
                    : ad.status === "paused"
                      ? "bg-orange-100 text-orange-800"
                      : ad.status === "pending_payment"
                      ? "bg-amber-100 text-amber-800"
                      : ad.status === "draft"
                        ? "bg-sky-100 text-sky-800"
                        : "bg-muted text-muted-foreground",
                )}
              >
                {ad.status === "pending_payment" ? "Pay" : ad.status}
              </span>
            </div>
            <p className="mt-2 grid grid-cols-4 gap-1 text-center text-[10px] font-bold text-muted-foreground">
              <span>{ad.unique_viewers} people</span>
              <span>{ad.likes_count} likes</span>
              <span>{ad.follows_count} follows</span>
              <span>{ad.buys_count} buys</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {ad.status === "pending_payment" || ad.status === "draft" ? (
                <Button size="sm" className="rounded-xl font-bold" onClick={() => void openPay(ad)}>
                  {ad.status === "draft" ? "Finish & pay" : "Pay to go live"}
                </Button>
              ) : null}
              {ad.status === "live" ? (
                <Button size="sm" variant="outline" className="rounded-xl font-bold" onClick={() => void control(ad, "pause")}>
                  Pause
                </Button>
              ) : null}
              {ad.status === "paused" ? (
                <Button size="sm" className="rounded-xl font-bold" onClick={() => void control(ad, "resume")}>
                  Resume
                </Button>
              ) : null}
              {ad.status === "live" || ad.status === "paused" || ad.status === "draft" || ad.status === "pending_payment" ? (
                <Button size="sm" variant="outline" className="rounded-xl font-bold" onClick={() => void control(ad, "stop")}>
                  Stop
                </Button>
              ) : null}
              <Button size="sm" variant="outline" className="rounded-xl font-bold text-red-700" onClick={() => void control(ad, "delete")}>
                Delete
              </Button>
              {adminMode && (ad.status === "pending_payment" || ad.status === "draft") ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl font-bold"
                  onClick={() =>
                    void publishAdAsAdmin(ad.id).then((r) => {
                      if (r.error) toast.error(r.error);
                      else {
                        toast.success("Published.");
                        void queryClient.invalidateQueries({ queryKey: ["sponsored-ads"] });
                      }
                    })
                  }
                >
                  Publish
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      )}
      {tab !== "support" && shown.length === 0 ? <p className="mt-3 text-[13px] text-muted-foreground">Nothing in this list yet.</p> : null}

      <p className="mt-6 text-[11px] text-muted-foreground">
        Live ads look like normal posts with a Paid ads tag. They finish automatically at the end of the period you paid for.
      </p>
    </>
  );

  if (embedded) return <div className="pb-8">{body}</div>;

  return (
    <MarketplaceShell hideTopBar variant="feed">
      <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", nativeCanvasClass())}>
        <NativePageHeader title={adminMode ? "Ads (admin)" : "Ads manager"} showBack />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10" style={{ WebkitOverflowScrolling: "touch" }}>
          {body}
        </div>
      </div>
    </MarketplaceShell>
  );
}

function AdsPayPanel({
  ad,
  adminMode,
  profileId,
  defaultName,
  defaultPhone,
  onClose,
  onPaid,
}: {
  ad: SponsoredAd;
  adminMode: boolean;
  profileId: string;
  defaultName: string;
  defaultPhone: string;
  onClose: () => void;
  onPaid: () => Promise<void>;
}) {
  const payQuery = useQuery({
    queryKey: ["ads-pay-account"],
    queryFn: fetchAdsPayAccount,
  });
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [mismatch, setMismatch] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const account = payQuery.data?.account;

  useEffect(() => {
    startTimer(ad.id);
    setLeft(remainingMs(ad.id) || WINDOW_MS);
    const id = window.setInterval(() => setLeft(remainingMs(ad.id)), 1000);
    return () => window.clearInterval(id);
  }, [ad.id]);

  async function copyNumber() {
    if (!account?.accountNumber) return;
    await navigator.clipboard.writeText(account.accountNumber);
    startTimer(ad.id);
    setLeft(remainingMs(ad.id) || WINDOW_MS);
    toast.success("Account number copied. Pay within 15 minutes.");
  }

  async function confirmPay() {
    setBusy(true);
    const started = sessionStorage.getItem(timerKey(ad.id));
    const watchedFrom = started ? new Date(Number(started) - 2 * 60 * 1000).toISOString() : ad.created_at;
    const result = await confirmAdPayment(ad.id, watchedFrom);
    setBusy(false);
    if (!result.paid) {
      setMismatch(true);
      toast.error(result.error ?? MISMATCH);
      return;
    }
    setMismatch(false);
    toast.success("Payment confirmed. Your paid ad is now on the feed.");
    await onPaid();
  }

  return (
    <section className="mt-5 overflow-hidden rounded-[28px] border border-[#1F7A4D]/25 bg-gradient-to-b from-[#F4FBF7] to-white p-4 shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold text-[#0B1F4D]">Pay {formatNgn(ad.amount_ngn)}</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Transfer the exact amount to musababubakar123@gmail.com’s TIJAR virtual account.
          </p>
        </div>
        <div className="flex min-w-[4.6rem] flex-col items-center rounded-2xl bg-[#0B1F4D] px-3 py-2 text-white">
          <Clock3 className="size-3.5 opacity-80" />
          <p className="mt-0.5 font-mono text-lg font-extrabold leading-none">{left > 0 ? formatClock(left) : "0:00"}</p>
          <p className="mt-1 text-[9px] font-bold uppercase tracking-wide text-white/70">minutes</p>
        </div>
      </div>
      <p className="mt-2 text-[12px] font-semibold text-[#1F7A4D]">
        {left > 0 ? `Pay within ${formatClock(left)}` : "15 minutes ended — you can still confirm if the transfer went through."}
      </p>
      {account ? (
        <dl className="mt-3 space-y-1 rounded-2xl bg-white/80 p-3 text-[13px]">
          <Row k="Bank" v={account.bankName} />
          <Row k="Name" v={account.accountName} />
          <Row k="Account" v={account.accountNumber} />
          <Row k="Amount" v={formatNgn(ad.amount_ngn)} />
        </dl>
      ) : (
        <p className="mt-2 text-[13px] text-muted-foreground">{payQuery.data?.error ?? "Loading account…"}</p>
      )}
      <Button variant="outline" className="mt-3 min-h-11 w-full rounded-xl font-bold" onClick={() => void copyNumber()} disabled={!account}>
        <Copy className="mr-2 size-4" /> Copy account number
      </Button>
      <Button className="mt-2 min-h-12 w-full rounded-xl bg-[#1F7A4D] font-extrabold" disabled={busy} onClick={() => void confirmPay()}>
        {busy ? "Checking…" : "I’ve made the payment"}
      </Button>
      {mismatch ? (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <button type="button" className="text-left text-[12px] font-semibold leading-relaxed text-amber-950" onClick={() => setSupportOpen(true)}>
            {MISMATCH}
          </button>
          <Button className="mt-3 min-h-11 w-full rounded-xl bg-[#0B1F4D] text-[13px] font-extrabold" onClick={() => setSupportOpen(true)}>
            <Headphones className="mr-2 size-4" /> Contact support
          </Button>
          {sent ? <p className="mt-2 text-center text-[12px] font-bold text-[#1F7A4D]">Sent to TIJAR admin. We will treat it.</p> : null}
        </div>
      ) : null}
      {supportOpen ? (
        <AdsSupportBox
          ad={ad}
          profileId={profileId}
          defaultName={defaultName}
          defaultPhone={defaultPhone}
          onClose={() => setSupportOpen(false)}
          onSent={() => {
            setSent(true);
            setSupportOpen(false);
          }}
        />
      ) : null}
      {adminMode ? (
        <Button
          variant="outline"
          className="mt-2 min-h-11 w-full rounded-xl font-bold"
          disabled={busy}
          onClick={() =>
            void publishAdAsAdmin(ad.id).then((r) => {
              if (r.error) toast.error(r.error);
              else {
                toast.success("Published without waiting for transfer.");
                void onPaid();
              }
            })
          }
        >
          Publish as admin
        </Button>
      ) : null}
      <button type="button" className="mt-3 w-full text-sm font-bold text-muted-foreground" onClick={onClose}>
        Close
      </button>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white p-2.5 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-extrabold text-[#0B1F4D]">{value}</p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-extrabold tracking-wide">{v}</dd>
    </div>
  );
}

function AdsSupportBox({
  ad,
  profileId,
  defaultName,
  defaultPhone,
  onClose,
  onSent,
}: {
  ad: SponsoredAd;
  profileId: string;
  defaultName: string;
  defaultPhone: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [message, setMessage] = useState(
    `I transferred ${formatNgn(ad.amount_ngn)} for this ad, but the app still says no matching transfer.`,
  );
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!profileId) {
      toast.error("Sign in first.");
      return;
    }
    setBusy(true);
    const result = await submitAdSupportTicket({
      ad,
      profileId,
      fullName: name,
      phone,
      message,
    });
    setBusy(false);
    if (result.error || !result.ticket) {
      toast.error(result.error ?? "Could not send.");
      return;
    }
    toast.success("Complaint sent to TIJAR admin.");
    onSent();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-[28px] bg-white p-4 shadow-2xl">
        <p className="text-sm font-extrabold text-[#0B1F4D]">Contact support</p>
        <p className="mt-1 text-[12px] text-muted-foreground">Write your name, phone and what happened. Admin sees this immediately on the Ads page.</p>
        <label className="mt-3 block text-[12px] font-extrabold">
          Name
          <Input className="mt-1 min-h-11 rounded-xl" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        </label>
        <label className="mt-3 block text-[12px] font-extrabold">
          Phone number
          <Input className="mt-1 min-h-11 rounded-xl" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="080…" />
        </label>
        <label className="mt-3 block text-[12px] font-extrabold">
          Complaint
          <textarea
            className="mt-1 min-h-28 w-full rounded-xl border bg-background px-3 py-2 text-sm"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What happened?"
          />
        </label>
        <Button className="mt-3 min-h-12 w-full rounded-xl bg-[#1F7A4D] font-extrabold" disabled={busy} onClick={() => void send()}>
          {busy ? "Sending…" : "Send to admin"}
        </Button>
        <button type="button" className="mt-2 w-full text-sm font-bold text-muted-foreground" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function AdminTicketsList({
  tickets,
  onStatus,
}: {
  tickets: SponsoredAdTicket[];
  onStatus: (id: string, status: AdsTicketStatus) => Promise<void>;
}) {
  if (tickets.length === 0) {
    return <p className="mt-3 text-[13px] text-muted-foreground">No payment complaints yet.</p>;
  }
  return (
    <ul className="mt-3 space-y-2">
      {tickets.map((ticket) => (
        <li key={ticket.id} className="rounded-[22px] border border-border/80 bg-white p-3.5 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-extrabold">{ticket.full_name}</p>
              <p className="text-[11px] text-muted-foreground">
                {ticket.phone}
                {ticket.shop_name ? ` · ${ticket.shop_name}` : ""} · {formatNgn(ticket.amount_ngn)}
              </p>
            </div>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase",
                ticket.status === "open"
                  ? "bg-amber-100 text-amber-800"
                  : ticket.status === "attended"
                    ? "bg-sky-100 text-sky-800"
                    : ticket.status === "resolved"
                      ? "bg-[#1F7A4D] text-white"
                      : "bg-muted text-muted-foreground",
              )}
            >
              {ticket.status}
            </span>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed">{ticket.message}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{ticket.ad_caption || "Paid ad"}</p>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {TICKET_STATUSES.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={ticket.status === item.id}
                onClick={() => void onStatus(ticket.id, item.id)}
                className={cn(
                  "min-h-9 rounded-xl border text-[11px] font-extrabold",
                  ticket.status === item.id ? "border-[#1F7A4D] bg-[#F4FBF7] text-[#1F7A4D]" : "border-border bg-card",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
