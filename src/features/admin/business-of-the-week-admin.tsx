"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminBusiness } from "@/services/admin-service";
import {
  endBusinessOfTheWeek,
  fetchAdminBusinessOfTheWeek,
  isPromotionLive,
  saveBusinessOfTheWeek,
  uploadBusinessOfTheWeekBanner,
  type AdminBusinessOfTheWeek,
} from "@/services/business-of-the-week-service";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toLocalInput(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultWindow(): { start: string; end: string } {
  const start = new Date();
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { start: toLocalInput(start), end: toLocalInput(end) };
}

export function BusinessOfTheWeekAdmin({ businesses }: { businesses: AdminBusiness[] }) {
  const queryClient = useQueryClient();
  const listQuery = useQuery({
    queryKey: ["admin-botw"],
    queryFn: async () => {
      const r = await fetchAdminBusinessOfTheWeek();
      if (r.error) throw new Error(r.error);
      return r.promotions;
    },
  });

  const [editId, setEditId] = useState<string | null>(null);
  const [businessId, setBusinessId] = useState("");
  const [shopQuery, setShopQuery] = useState("");
  const [promoText, setPromoText] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [startsAt, setStartsAt] = useState(() => defaultWindow().start);
  const [endsAt, setEndsAt] = useState(() => defaultWindow().end);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const promotions = listQuery.data ?? [];
  const live = promotions.find((p) => isPromotionLive(p)) ?? null;

  useEffect(() => {
    if (editId || businessId || !live) return;
    loadIntoForm(live);
    // Prefill the live promotion once so admin can edit dates/copy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live?.id]);

  const shops = useMemo(() => {
    const q = shopQuery.trim().toLowerCase();
    return businesses
      .filter((b) => !q || `${b.business_name} ${b.public_slug ?? ""} ${b.owner?.full_name ?? ""}`.toLowerCase().includes(q))
      .slice(0, 80);
  }, [businesses, shopQuery]);

  function loadIntoForm(row: AdminBusinessOfTheWeek) {
    setEditId(row.id);
    setBusinessId(row.businessId);
    setPromoText(row.promoText ?? "");
    setBannerUrl(row.bannerUrl ?? "");
    setStartsAt(toLocalInput(row.startsAt));
    setEndsAt(toLocalInput(row.endsAt));
    setShopQuery(row.businessName);
  }

  function resetForm() {
    const win = defaultWindow();
    setEditId(null);
    setBusinessId("");
    setShopQuery("");
    setPromoText("");
    setBannerUrl("");
    setStartsAt(win.start);
    setEndsAt(win.end);
  }

  async function onSave() {
    if (!businessId) {
      toast.error("Select a business from the list.");
      return;
    }
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      toast.error("Set a start and end date. Default is 7 days.");
      return;
    }
    setSaving(true);
    const r = await saveBusinessOfTheWeek({
      id: editId,
      businessId,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      promoText,
      bannerUrl,
    });
    setSaving(false);
    if (r.error) toast.error(r.error);
    else {
      toast.success(editId ? "Business of the Week updated" : "Business of the Week is live");
      await queryClient.invalidateQueries({ queryKey: ["admin-botw"] });
      await queryClient.invalidateQueries({ queryKey: ["business-of-the-week"] });
    }
  }

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-5">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm lg:col-span-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <h2 className="text-base font-extrabold">{editId ? "Edit Business of the Week" : "Create Business of the Week"}</h2>
        </div>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Only one promotion can run at a time. It appears at the top of For You and in Stories until the end date.
        </p>

        <label className="mt-4 block text-[12px] font-bold uppercase tracking-wide text-muted-foreground">Business</label>
        <Input
          value={shopQuery}
          onChange={(e) => setShopQuery(e.target.value)}
          placeholder="Search existing businesses…"
          className="mt-1 h-11 rounded-xl"
        />
        <ul className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-border">
          {shops.map((shop) => {
            const active = shop.id === businessId;
            return (
              <li key={shop.id}>
                <button
                  type="button"
                  onClick={() => {
                    setBusinessId(shop.id);
                    setShopQuery(shop.business_name);
                  }}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${active ? "bg-primary/10" : "hover:bg-muted/60"}`}
                >
                  {shop.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={shop.logo_url} alt="" className="size-9 rounded-full object-cover" />
                  ) : (
                    <span className="flex size-9 items-center justify-center rounded-full bg-[#0A2540] text-xs font-extrabold text-white">
                      {shop.business_name.slice(0, 1)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{shop.business_name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {shop.owner?.full_name ?? "Owner"} · {shop.public_location_label ?? shop.location ?? "Nigeria"}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-[13px] font-semibold">
            Start
            <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="mt-1 h-11 rounded-xl" />
          </label>
          <label className="text-[13px] font-semibold">
            End (default 7 days)
            <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="mt-1 h-11 rounded-xl" />
          </label>
        </div>

        <label className="mt-4 block text-[13px] font-semibold">
          Promotional text (optional)
          <Input
            value={promoText}
            onChange={(e) => setPromoText(e.target.value)}
            maxLength={160}
            placeholder="This week’s featured shop on TIJAR"
            className="mt-1 h-11 rounded-xl"
          />
        </label>

        <label className="mt-4 block text-[13px] font-semibold">
          Banner image (optional)
          <input
            type="file"
            accept="image/*"
            className="mt-1 block w-full text-sm"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setUploading(true);
              const r = await uploadBusinessOfTheWeekBanner(file);
              setUploading(false);
              if (r.error || !r.publicUrl) toast.error(r.error ?? "Could not upload banner");
              else {
                setBannerUrl(r.publicUrl);
                toast.success("Banner uploaded");
              }
            }}
          />
        </label>
        {uploading ? <p className="mt-1 text-[12px] text-muted-foreground">Uploading…</p> : null}
        {bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bannerUrl} alt="" className="mt-2 h-28 w-full rounded-xl object-cover" />
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button className="rounded-xl font-extrabold" disabled={saving} onClick={() => void onSave()}>
            {saving ? "Saving…" : editId ? "Save changes" : "Publish this week"}
          </Button>
          <Button type="button" variant="outline" className="rounded-xl font-bold" onClick={resetForm}>
            New promotion
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm lg:col-span-2">
        <h2 className="text-base font-extrabold">Schedule</h2>
        {listQuery.isLoading ? <p className="mt-3 text-sm text-muted-foreground">Loading…</p> : null}
        {listQuery.error ? (
          <p className="mt-3 text-sm text-destructive">
            {(listQuery.error as Error).message}. Run the Business of the Week SQL in Supabase first.
          </p>
        ) : null}
        {(promotions.length === 0 && !listQuery.isLoading) ? (
          <p className="mt-3 text-sm text-muted-foreground">No promotions yet. Create one from a business in the database.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {promotions.map((row) => {
              const liveNow = isPromotionLive(row);
              return (
                <li key={row.id} className="rounded-xl border border-border p-3">
                  <p className="font-extrabold">{row.businessName}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(row.startsAt).toLocaleString()} → {new Date(row.endsAt).toLocaleString()}
                  </p>
                  <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-primary">
                    {liveNow ? "Live now" : new Date(row.endsAt).getTime() <= Date.now() ? "Ended" : "Scheduled"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" className="h-8 rounded-lg text-xs" onClick={() => loadIntoForm(row)}>
                      Edit
                    </Button>
                    {liveNow ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-lg text-xs"
                        onClick={async () => {
                          const r = await endBusinessOfTheWeek(row.id);
                          if (r.error) toast.error(r.error);
                          else {
                            toast.success("Ended this week’s feature");
                            await queryClient.invalidateQueries({ queryKey: ["admin-botw"] });
                            await queryClient.invalidateQueries({ queryKey: ["business-of-the-week"] });
                          }
                        }}
                      >
                        End now
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
