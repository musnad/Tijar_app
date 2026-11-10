"use client";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordToggle } from "@/features/auth/auth-ui";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { NativePageHeader, nativeCanvasClass } from "@/features/marketplace/native-page-header";
import { useAuth } from "@/features/auth/auth-context";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { formatNgn } from "@/utils/money";

async function authHeader() {
  const {
    data: { session },
  } = await getSupabaseBrowserClient().auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export function AgentShopDetailScreen({ shopId }: { shopId: string }) {
  const { profile } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const detailQuery = useQuery({
    queryKey: ["agent-shop", shopId],
    enabled: Boolean(profile?.id && shopId),
    queryFn: async () => {
      const res = await fetch(`/api/agent/shop/${shopId}`, { headers: await authHeader(), cache: "no-store" });
      const json = (await res.json()) as {
        error?: string;
        shop?: {
          id: string;
          businessName: string;
          username: string;
          email: string;
          password: string;
          phone: string;
          location: string;
          category: string;
          logoUrl: string;
          gallery: string[];
        };
        products?: Array<{ id: string; name: string; kind: string; sale_price: number | null; image_url: string | null }>;
        edits?: Array<{ id: string; status: string; created_at: string }>;
      };
      if (!res.ok || !json.shop) throw new Error(json.error ?? "Could not load this shop.");
      return json;
    },
  });
  const shop = detailQuery.data?.shop;
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [password, setPassword] = useState("");
  const [category, setCategory] = useState("");

  useEffect(() => {
    if (!shop) return;
    setBusinessName(shop.businessName);
    setPhone(shop.phone ?? "");
    setLocation(shop.location ?? "");
    setPassword(shop.password ?? "");
    setCategory(shop.category ?? "");
  }, [shop]);

  async function requestEdit() {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/agent/shop/${shopId}`, {
        method: "POST",
        headers: { ...(await authHeader()), "Content-Type": "application/json" },
        body: JSON.stringify({ businessName, phone, location, password, category }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; applied?: boolean };
      if (!res.ok) {
        toast.error(json.error ?? "Could not send this edit.");
        return;
      }
      toast.success(json.applied ? "Shop updated." : "Sent to admin. The shop changes after they approve.");
      await detailQuery.refetch();
    } finally {
      setSaving(false);
    }
  }

  return (
    <MarketplaceShell hideTopBar variant="feed">
      <div className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto", nativeCanvasClass())}>
        <NativePageHeader title={shop?.businessName || "Shop"} subtitle="Agent shop" showBack />
        <div className="space-y-4 px-4 pb-10">
          {detailQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading shop…</p> : null}
          {detailQuery.error ? <p className="text-sm text-destructive">{(detailQuery.error as Error).message}</p> : null}
          {shop ? (
            <>
              <section className="rounded-[24px] border border-border bg-white p-4 shadow-sm">
                <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#1F7A4D]">Login</p>
                <p className="mt-2 text-sm">
                  <span className="text-muted-foreground">Email </span>
                  <span className="font-extrabold">{shop.email}</span>
                </p>
                <p className="mt-1 text-sm">
                  <span className="text-muted-foreground">Username </span>
                  <span className="font-extrabold">@{shop.username}</span>
                </p>
                <p className="mt-1 flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Password</span>
                  <span className="font-extrabold">{showPassword ? shop.password || "—" : "••••••••"}</span>
                  <PasswordToggle visible={showPassword} onToggle={() => setShowPassword((v) => !v)} />
                </p>
                <p className="mt-1 text-sm">
                  <span className="text-muted-foreground">Phone </span>
                  <span className="font-extrabold">{shop.phone || "—"}</span>
                </p>
                <p className="mt-1 text-sm">
                  <span className="text-muted-foreground">Location </span>
                  <span className="font-extrabold">{shop.location || "—"}</span>
                </p>
                <Link className="mt-3 inline-flex min-h-10 items-center rounded-2xl bg-[#1F7A4D] px-4 text-sm font-extrabold text-white" to="/b/$slug" params={{ slug: shop.username || shop.id }}>
                  Open public shop
                </Link>
              </section>

              {(shop.gallery ?? []).length > 0 ? (
                <section className="rounded-[24px] border border-border bg-white p-4 shadow-sm">
                  <p className="text-sm font-extrabold">Pictures</p>
                  <div className="mt-2 flex gap-2 overflow-x-auto">
                    {shop.gallery.map((src) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={src} src={src} alt="" className="size-20 rounded-2xl object-cover" />
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="rounded-[24px] border border-border bg-white p-4 shadow-sm">
                <p className="text-sm font-extrabold">Products and services</p>
                {(detailQuery.data?.products ?? []).length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">None yet.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {(detailQuery.data?.products ?? []).map((item) => (
                      <li key={item.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[#F8FAFC] px-3 py-2">
                        <span className="font-bold">{item.name}</span>
                        <span className="text-sm font-extrabold text-[#1F7A4D]">
                          {item.sale_price != null ? formatNgn(Number(item.sale_price)) : item.kind}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <form
                className="space-y-3 rounded-[24px] border border-border bg-white p-4 shadow-sm"
                onSubmit={(e) => {
                  e.preventDefault();
                  void requestEdit();
                }}
              >
                <p className="text-sm font-extrabold">Request an edit</p>
                <p className="text-[12px] text-muted-foreground">You cannot delete this shop. Changes wait for admin approval.</p>
                <Input className="h-12 rounded-2xl" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Business name" />
                <Input className="h-12 rounded-2xl" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" />
                <Input className="h-12 rounded-2xl" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location" />
                <Input className="h-12 rounded-2xl" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" />
                <div className="relative">
                  <Input className="h-12 rounded-2xl pr-12" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
                    <PasswordToggle visible={showPassword} onToggle={() => setShowPassword((v) => !v)} />
                  </div>
                </div>
                <Button className="h-12 w-full rounded-2xl bg-[#0B1F4D] font-extrabold" disabled={saving}>
                  {saving ? "Sending…" : "Send to admin"}
                </Button>
                {(detailQuery.data?.edits ?? []).some((row) => row.status === "pending") ? (
                  <p className="text-[12px] font-bold text-amber-700">An edit is waiting for admin.</p>
                ) : null}
              </form>
            </>
          ) : null}
        </div>
      </div>
    </MarketplaceShell>
  );
}
