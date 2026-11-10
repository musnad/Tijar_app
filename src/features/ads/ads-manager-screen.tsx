"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";
import { useMemo, useState } from "react";
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
  createSponsoredAd,
  fetchAdsPayAccount,
  fetchAllAdsAdmin,
  fetchMyAds,
  publishAdAsAdmin,
  type SponsoredAd,
} from "@/services/ads-service";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchPostsForBusiness } from "@/services/video-feed-service";
import { listProducts } from "@/services/product-service";
import { formatNgn } from "@/utils/money";

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

  const businessId = adminMode ? adminShopId || shop?.id || "" : shop?.id || "";

  const adsQuery = useQuery({
    queryKey: ["sponsored-ads", adminMode ? "admin" : businessId],
    enabled: adminMode || Boolean(businessId),
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
  const payQuery = useQuery({
    queryKey: ["ads-pay-account"],
    enabled: Boolean(payAd),
    queryFn: fetchAdsPayAccount,
  });

  const pack = AD_PACKAGES.find((p) => p.hours === hours)!;
  const ads = adsQuery.data?.ads ?? [];
  const live = ads.filter((a) => a.status === "live");
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

  async function submit() {
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
    if (adminMode) {
      const liveNow = await publishAdAsAdmin(created.ad.id);
      if (liveNow.error) {
        setPayAd(created.ad);
        toast.message("Pay to go live, or tap Publish if this is a platform ad.");
        return;
      }
      toast.success("Ad is live on the feed.");
      return;
    }
    setPayAd(created.ad);
  }

  async function confirmPay() {
    if (!payAd) return;
    setBusy(true);
    const result = await confirmAdPayment(payAd.id);
    setBusy(false);
    if (!result.paid) {
      toast.error(result.error ?? "Payment not seen yet.");
      return;
    }
    toast.success("Payment confirmed. Your paid ad is now on the feed.");
    setPayAd(null);
    await queryClient.invalidateQueries({ queryKey: ["sponsored-ads"] });
  }

  const body = (
    <>
          <p className="mt-2 text-[13px] text-muted-foreground">
            Promote a post, product, or flyer. Same prices for every category. Pay into the TIJAR virtual account — we go live after the transfer, and the ad stops on the date you pick.
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <Stat label="People shown" value={String(totals.people)} />
            <Stat label="Views" value={String(totals.views)} />
            <Stat label="Likes" value={String(totals.likes)} />
            <Stat label="Follows" value={String(totals.follows)} />
            <Stat label="Calls" value={String(totals.calls)} />
            <Stat label="Buys" value={String(totals.buys)} />
          </div>

          {payAd ? (
            <section className="mt-5 rounded-2xl border border-[#1F7A4D]/30 bg-[#F4FBF7] p-4">
              <p className="text-sm font-extrabold text-[#0B1F4D]">Pay {formatNgn(payAd.amount_ngn)}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Transfer to musababubakar123@gmail.com’s TIJAR virtual account. Use the exact amount so we can match it.
              </p>
              {payQuery.data?.account ? (
                <dl className="mt-3 space-y-1 text-[13px]">
                  <Row k="Bank" v={payQuery.data.account.bankName} />
                  <Row k="Name" v={payQuery.data.account.accountName} />
                  <Row k="Account" v={payQuery.data.account.accountNumber} />
                  <Row k="Amount" v={formatNgn(payAd.amount_ngn)} />
                </dl>
              ) : (
                <p className="mt-2 text-[13px] text-muted-foreground">{payQuery.data?.error ?? "Loading account…"}</p>
              )}
              <Button className="mt-4 min-h-12 w-full rounded-xl bg-[#1F7A4D] font-extrabold" disabled={busy} onClick={() => void confirmPay()}>
                {busy ? "Checking…" : "I’ve made the payment"}
              </Button>
              {adminMode ? (
                <Button variant="outline" className="mt-2 min-h-11 w-full rounded-xl font-bold" disabled={busy} onClick={() => void publishAdAsAdmin(payAd.id).then((r) => {
                  if (r.error) toast.error(r.error);
                  else {
                    toast.success("Published without waiting for transfer.");
                    setPayAd(null);
                    void queryClient.invalidateQueries({ queryKey: ["sponsored-ads"] });
                  }
                })}>
                  Publish as admin
                </Button>
              ) : null}
            </section>
          ) : null}

          {!creating ? (
            <Button className="mt-5 min-h-12 w-full rounded-xl bg-[#0B1F4D] font-extrabold" onClick={() => setCreating(true)}>
              <Megaphone className="mr-2 size-4" /> Create ad
            </Button>
          ) : (
            <section className="mt-5 space-y-4 rounded-2xl border border-border bg-card p-4">
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
                  <button key={item.id} type="button" onClick={() => setObjective(item.id)} className={cn("rounded-2xl border px-3 py-3 text-left", objective === item.id ? "border-[#1F7A4D] bg-[#F4FBF7]" : "border-border")}>
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
                  <button key={id} type="button" onClick={() => setSource(id)} className={cn("min-h-11 rounded-xl border text-[13px] font-extrabold", source === id ? "border-[#1F7A4D] bg-[#1F7A4D] text-white" : "border-border")}>
                    {label}
                  </button>
                ))}
              </div>
              {source === "flyer" ? <ProductPhotosField photos={flyer} onChange={setFlyer} required /> : null}
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
                  <button key={item.hours} type="button" onClick={() => setHours(item.hours)} className={cn("flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left", hours === item.hours ? "border-[#1F7A4D] bg-[#F4FBF7]" : "border-border")}>
                    <span>
                      <span className="block text-sm font-extrabold">{item.label}</span>
                      <span className="text-[11px] text-muted-foreground">{item.blurb}</span>
                    </span>
                    <span className="text-sm font-extrabold text-[#1F7A4D]">{formatNgn(item.amount)}</span>
                  </button>
                ))}
              </div>

              <Button className="min-h-12 w-full rounded-xl bg-[#1F7A4D] font-extrabold" disabled={busy} onClick={() => void submit()}>
                {busy ? "Saving…" : adminMode ? `Create · ${formatNgn(pack.amount)} or publish free` : `Continue · ${formatNgn(pack.amount)}`}
              </Button>
              <button type="button" className="w-full text-sm font-bold text-muted-foreground" onClick={() => setCreating(false)}>
                Cancel
              </button>
            </section>
          )}

          <h2 className="mt-8 text-sm font-extrabold">Campaigns {live.length ? `· ${live.length} live` : ""}</h2>
          <ul className="mt-2 space-y-2">
            {ads.map((ad) => (
              <li key={ad.id} className="rounded-2xl border border-border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-extrabold">{ad.caption || "Paid ad"}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {ad.shop_name ? `${ad.shop_name} · ` : ""}
                      {ad.objective} · {ad.duration_hours / 24} day{ad.duration_hours === 24 ? "" : "s"} · {formatNgn(ad.amount_ngn)}
                    </p>
                  </div>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase", ad.status === "live" ? "bg-[#1F7A4D] text-white" : ad.status === "pending_payment" ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground")}>
                    {ad.status === "pending_payment" ? "Pay" : ad.status}
                  </span>
                </div>
                <p className="mt-2 grid grid-cols-4 gap-1 text-center text-[10px] font-bold text-muted-foreground">
                  <span>{ad.unique_viewers} people</span>
                  <span>{ad.likes_count} likes</span>
                  <span>{ad.follows_count} follows</span>
                  <span>{ad.buys_count} buys</span>
                </p>
                {ad.status === "pending_payment" ? (
                  <Button size="sm" className="mt-2 rounded-xl font-bold" onClick={() => setPayAd(ad)}>
                    Pay to go live
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {ads.length === 0 ? <p className="mt-3 text-[13px] text-muted-foreground">No campaigns yet.</p> : null}

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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-2.5">
      <p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
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
