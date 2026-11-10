"use client";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Phone, Store } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { useAuth } from "@/features/auth/auth-context";
import { tijarShopEmail, shopUsernameFromName } from "@/lib/agent-email";
import { getMapsProvider } from "@/lib/maps/provider";
import { compressImageFile } from "@/lib/media/compress-upload";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { listBusinessCategories } from "@/services/business-service";
import { fetchMyPlatformRoles } from "@/services/discover-service";
import { slugifyBusinessName } from "@/utils/discover";

type CreatedShop = {
  id: string;
  businessName: string;
  username: string;
  email: string;
  phone: string;
  location: string;
};

async function authHeader() {
  const {
    data: { session },
  } = await getSupabaseBrowserClient().auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export function AgentSetupScreen() {
  const { profile } = useAuth();
  const rolesQuery = useQuery({
    queryKey: ["platform-roles", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: () => fetchMyPlatformRoles(profile!.id),
  });
  const isAgent = (rolesQuery.data ?? []).includes("agent") || (rolesQuery.data ?? []).includes("admin");
  const categoriesQuery = useQuery({
    queryKey: ["business-categories"],
    queryFn: async () => (await listBusinessCategories()).data,
  });
  const shopsQuery = useQuery({
    queryKey: ["agent-shops"],
    enabled: isAgent,
    queryFn: async () => {
      const res = await fetch("/api/agent/shops", { headers: await authHeader(), cache: "no-store" });
      const json = (await res.json()) as { shops?: Array<Record<string, unknown>>; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load shops.");
      return json.shops ?? [];
    },
  });

  const [businessName, setBusinessName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<CreatedShop | null>(null);

  const slug = slugifyBusinessName(username || businessName);
  const email = tijarShopEmail(slug || shopUsernameFromName(businessName));
  const categories = categoriesQuery.data ?? [];
  const otherSelected = /other/i.test(categories.find((c) => c.id === categoryId)?.slug ?? categoryId);

  const photoNames = useMemo(() => photos.map((f) => f.name).join(", "), [photos]);

  async function submit() {
    if (saving) return;
    setSaving(true);
    try {
      const form = new FormData();
      form.set("businessName", businessName.trim());
      form.set("username", slug);
      form.set("password", password);
      form.set("phone", phone.trim());
      form.set("location", location.trim());
      form.set("categoryId", categoryId);
      form.set("customCategory", otherSelected || !categoryId ? customCategory.trim() : "");
      const hits = location.trim() ? await getMapsProvider().geocode(`${location.trim()}, Nigeria`) : [];
      if (hits[0]) {
        form.set("lat", String(hits[0].lat));
        form.set("lng", String(hits[0].lng));
      }
      if (logo) form.set("logo", await compressImageFile(logo, 640));
      for (const photo of photos.slice(0, 5)) {
        form.append("photos", await compressImageFile(photo, 1280));
      }
      const res = await fetch("/api/agent/shops", {
        method: "POST",
        headers: await authHeader(),
        body: form,
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; shop?: CreatedShop };
      if (!res.ok || !json.shop) {
        toast.error(json.error ?? "Could not create this shop.");
        return;
      }
      setCreated(json.shop);
      setBusinessName("");
      setUsername("");
      setPassword("");
      setPhone("");
      setLocation("");
      setCustomCategory("");
      setLogo(null);
      setPhotos([]);
      toast.success("Shop is live and searchable.");
      await shopsQuery.refetch();
    } finally {
      setSaving(false);
    }
  }

  if (!profile) {
    return (
      <MarketplaceShell>
        <p className="p-6 text-sm text-muted-foreground">Sign in as an agent first.</p>
      </MarketplaceShell>
    );
  }

  if (rolesQuery.isLoading) {
    return (
      <MarketplaceShell>
        <p className="p-6 text-sm text-muted-foreground">Checking agent access…</p>
      </MarketplaceShell>
    );
  }

  if (!isAgent) {
    return (
      <MarketplaceShell>
        <div className="p-6">
          <p className="font-extrabold">Agents only</p>
          <p className="mt-1 text-sm text-muted-foreground">Ask TIJAR admin to make this account an agent.</p>
        </div>
      </MarketplaceShell>
    );
  }

  return (
    <MarketplaceShell>
      <div className="space-y-4 pb-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">TIJAR agent</p>
          <h1 className="text-xl font-extrabold">Set up a business</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a login, photos, phone and location so customers can search and call them.
          </p>
        </div>

        {created ? (
          <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4 text-sm">
            <p className="font-extrabold">{created.businessName} is ready</p>
            <p className="mt-1">Email: {created.email}</p>
            <p>Username: @{created.username}</p>
            <p>Phone: {created.phone}</p>
            <Link className="mt-2 inline-block font-bold text-primary" to="/b/$slug" params={{ slug: created.username }}>
              Open shop
            </Link>
          </div>
        ) : null}

        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <Input className="h-11 rounded-xl" placeholder="Business name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          <Input
            className="h-11 rounded-xl"
            placeholder={shopUsernameFromName(businessName) || "Username"}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Login email: {email}</p>
          <Input className="h-11 rounded-xl" type="password" placeholder="Password they will use" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Input className="h-11 rounded-xl" placeholder="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          <Input className="h-11 rounded-xl" placeholder="Location, e.g. Wuse 2, Abuja" value={location} onChange={(e) => setLocation(e.target.value)} />
          <select
            className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-semibold"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Select category</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          {otherSelected || !categoryId ? (
            <Input
              className="h-11 rounded-xl"
              placeholder="If Other, write the category"
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
            />
          ) : null}
          <label className="block text-sm font-bold">
            Logo
            <input className="mt-1 block w-full text-sm" type="file" accept="image/*" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} />
          </label>
          <label className="block text-sm font-bold">
            Up to 5 pictures
            <input
              className="mt-1 block w-full text-sm"
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setPhotos(Array.from(e.target.files ?? []).slice(0, 5))}
            />
          </label>
          {photoNames ? <p className="text-xs text-muted-foreground">{photos.length} selected · {photoNames}</p> : null}
          <Button className="w-full rounded-xl font-extrabold" disabled={saving} onClick={() => void submit()}>
            {saving ? "Creating shop…" : "Create shop"}
          </Button>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="font-extrabold">Shops you set up</h2>
          {(shopsQuery.data ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">None yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {(shopsQuery.data ?? []).map((shop) => (
                <li key={String(shop.id)} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 font-bold">
                      <Store className="size-3.5" />
                      {String(shop.business_name)}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      @{String(shop.public_slug ?? "")} · {String(shop.public_phone ?? "")}
                    </span>
                  </span>
                  {shop.public_phone ? (
                    <a className="text-xs font-bold text-primary" href={`tel:${String(shop.public_phone).replace(/[^\d+]/g, "")}`}>
                      <Phone className="size-4" />
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </MarketplaceShell>
  );
}
