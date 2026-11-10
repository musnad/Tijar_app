"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { AtSign, Camera, GitBranch, ImagePlus, MapPin, Phone, Store, Tag } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordToggle } from "@/features/auth/auth-ui";
import { signInWithEmail } from "@/features/auth/auth-service";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { NativePageHeader, nativeCanvasClass } from "@/features/marketplace/native-page-header";
import { useAuth } from "@/features/auth/auth-context";
import { writeActiveShopId } from "@/lib/active-business";
import { tijarShopEmail } from "@/lib/agent-email";
import { getMapsProvider } from "@/lib/maps/provider";
import { compressImageFile } from "@/lib/media/compress-upload";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { listBusinessCategories } from "@/services/business-service";
import { slugifyBusinessName } from "@/utils/discover";

type CreatedShop = {
  id: string;
  businessName: string;
  username: string;
  email: string;
  phone: string;
  location: string;
  password: string;
};

type BranchRow = {
  id: string;
  business_name?: string;
  public_slug?: string;
  public_phone?: string;
  public_location_label?: string;
  logo_url?: string;
  login_email?: string;
  login_password?: string;
};

async function authHeader() {
  const {
    data: { session },
  } = await getSupabaseBrowserClient().auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

function FieldLabel({ children }: { children: string }) {
  return <p className="mb-1.5 text-[12px] font-extrabold uppercase tracking-wide text-[#6B7280]">{children}</p>;
}

function FileWell({
  label,
  hint,
  preview,
  multiple,
  onFiles,
}: {
  label: string;
  hint: string;
  preview?: string[];
  multiple?: boolean;
  onFiles: (files: File[]) => void;
}) {
  return (
    <label className="block cursor-pointer">
      <FieldLabel>{label}</FieldLabel>
      <div className="flex min-h-[5.5rem] items-center gap-3 rounded-2xl border border-dashed border-[#1F7A4D]/35 bg-[#F4FBF7] px-3 py-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white text-[#1F7A4D] shadow-sm">
          {multiple ? <ImagePlus className="size-5" /> : <Camera className="size-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-extrabold text-[#0B1F4D]">{hint}</span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">JPG or PNG · tap to choose</span>
        </span>
        {preview && preview.length > 0 ? (
          <span className="flex gap-1">
            {preview.slice(0, 3).map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src} src={src} alt="" className="size-11 rounded-xl object-cover ring-2 ring-white" />
            ))}
          </span>
        ) : null}
      </div>
      <input
        className="sr-only"
        type="file"
        accept="image/*"
        multiple={multiple}
        onChange={(e) => onFiles(Array.from(e.target.files ?? []))}
      />
    </label>
  );
}

function money(value: number): string {
  return `₦${Math.round(value).toLocaleString("en-NG")}`;
}

export function BranchShopsScreen() {
  const { profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const categoriesQuery = useQuery({
    queryKey: ["business-categories"],
    queryFn: async () => (await listBusinessCategories()).data,
  });
  const shopsQuery = useQuery({
    queryKey: ["branch-shops"],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      const res = await fetch("/api/shop/branches", { headers: await authHeader(), cache: "no-store" });
      const json = (await res.json()) as {
        shops?: BranchRow[];
        headquarters?: Array<{ id: string; business_name: string }>;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Could not load branches.");
      return { shops: json.shops ?? [], headquarters: json.headquarters ?? [] };
    },
  });

  const [businessName, setBusinessName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showCreatedPassword, setShowCreatedPassword] = useState(false);
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [offerName, setOfferName] = useState("");
  const [offerPrice, setOfferPrice] = useState("");
  const [offerKind, setOfferKind] = useState<"goods" | "service">("goods");
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<CreatedShop | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [usernameMessage, setUsernameMessage] = useState("");
  const [openShopId, setOpenShopId] = useState<string | null>(null);
  const [showShopPassword, setShowShopPassword] = useState(false);
  const [parentId, setParentId] = useState("");

  const slug = slugifyBusinessName(username);
  const email = slug ? tijarShopEmail(slug) : "";
  const categories = categoriesQuery.data ?? [];
  const otherSelected = /other/i.test(categories.find((c) => c.id === categoryId)?.slug ?? categoryId);
  const logoPreview = useMemo(() => (logo ? URL.createObjectURL(logo) : ""), [logo]);
  const photoPreviews = useMemo(() => photos.map((file) => URL.createObjectURL(file)), [photos]);
  const hq = shopsQuery.data?.headquarters ?? [];

  useEffect(() => {
    if (!parentId && hq[0]?.id) setParentId(hq[0].id);
  }, [hq, parentId]);

  useEffect(() => {
    return () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
      photoPreviews.forEach((src) => URL.revokeObjectURL(src));
    };
  }, [logoPreview, photoPreviews]);

  useEffect(() => {
    if (!slug) {
      setUsernameStatus("idle");
      setUsernameMessage("");
      return;
    }
    setUsernameStatus("checking");
    setUsernameMessage("Checking if this login is free…");
    const timer = window.setTimeout(() => {
      void (async () => {
        const typed = username.trim();
        const res = await fetch(`/api/shop/branches?username=${encodeURIComponent(typed)}`, {
          headers: { ...(await authHeader()), "x-tijar-username": typed },
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as { available?: boolean; error?: string };
        if (typeof json.available !== "boolean") {
          setUsernameStatus("idle");
          setUsernameMessage("Could not check this username. Try again.");
          return;
        }
        if (json.available) {
          setUsernameStatus("available");
          setUsernameMessage("Available");
          return;
        }
        setUsernameStatus(json.error?.includes("2 characters") ? "invalid" : "taken");
        setUsernameMessage(json.error ?? "Already taken");
      })();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [slug, username]);

  const detailQuery = useQuery({
    queryKey: ["branch-shop-detail", openShopId],
    enabled: Boolean(openShopId),
    queryFn: async () => {
      const res = await fetch(`/api/shop/branches?shopId=${encodeURIComponent(openShopId!)}`, {
        headers: await authHeader(),
        cache: "no-store",
      });
      const json = (await res.json()) as {
        error?: string;
        shop?: CreatedShop & { logoUrl?: string };
        posts?: Array<{ id: string; caption?: string; created_at?: string }>;
        transactions?: Array<{ id: string; type?: string; amount?: number; occurred_at?: string; description?: string }>;
        products?: Array<{ id: string; name?: string; sale_price?: number }>;
        stats?: { posts?: number; products?: number; sales?: number; orders?: number };
      };
      if (!res.ok) throw new Error(json.error ?? "Could not load this branch.");
      return json;
    },
  });

  async function submit() {
    if (saving) return;
    if (hq.length === 0) {
      toast.error("Create your main business first, then add a branch.");
      return;
    }
    if (!slug) {
      toast.error("Type a username for their login.");
      return;
    }
    if (usernameStatus === "taken" || usernameStatus === "invalid") {
      toast.error(usernameMessage || "That username is already taken.");
      return;
    }
    setSaving(true);
    try {
      const form = new FormData();
      form.set("parentBusinessId", parentId || hq[0]?.id || "");
      form.set("businessName", businessName.trim());
      form.set("username", slug);
      form.set("password", password);
      form.set("phone", phone.trim());
      form.set("location", location.trim());
      form.set("categoryId", categoryId);
      form.set("customCategory", otherSelected || !categoryId ? customCategory.trim() : "");
      const price = Number(offerPrice.replace(/,/g, ""));
      form.set(
        "offers",
        JSON.stringify(offerName.trim() && price > 0 ? [{ kind: offerKind, name: offerName.trim(), price }] : []),
      );
      const hits = location.trim() ? await getMapsProvider().geocode(`${location.trim()}, Nigeria`) : [];
      if (hits[0]) {
        form.set("lat", String(hits[0].lat));
        form.set("lng", String(hits[0].lng));
      }
      if (logo) form.set("logo", await compressImageFile(logo, 640));
      for (const photo of photos.slice(0, 5)) {
        form.append("photos", await compressImageFile(photo, 1280));
      }
      const res = await fetch("/api/shop/branches", {
        method: "POST",
        headers: await authHeader(),
        body: form,
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; shop?: CreatedShop };
      if (!res.ok || !json.shop) {
        toast.error(json.error ?? "Could not create this branch.");
        return;
      }
      setCreated({ ...json.shop, password });
      setShowCreatedPassword(false);
      setBusinessName("");
      setUsername("");
      setPassword("");
      setShowPassword(false);
      setPhone("");
      setLocation("");
      setCustomCategory("");
      setLogo(null);
      setPhotos([]);
      setOfferName("");
      setOfferPrice("");
      toast.success("Branch is live. You can monitor it and switch into it.");
      await shopsQuery.refetch();
      await queryClient.invalidateQueries({ queryKey: ["owned-businesses"] });
    } finally {
      setSaving(false);
    }
  }

  async function workAsThisShop(id: string, name: string) {
    if (!profile) return;
    writeActiveShopId(profile.id, id);
    await queryClient.invalidateQueries({ queryKey: ["primary-business", profile.id] });
    toast.success(`Now viewing ${name}`);
    void navigate({ to: "/app" });
  }

  async function loginAsThisShop(loginEmail: string, loginPassword: string) {
    if (!loginEmail || !loginPassword) {
      toast.error("Login is not stored yet.");
      return;
    }
    if (!window.confirm("This signs you out of headquarters and into the branch account.")) return;
    const { error } = await signInWithEmail(loginEmail, loginPassword);
    if (error) {
      toast.error(error.message);
      return;
    }
    await refreshProfile();
    toast.success("Signed in as this branch");
    void navigate({ to: "/app" });
  }

  const shell = (children: ReactNode) => (
    <MarketplaceShell hideTopBar variant="feed">
      <div className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto", nativeCanvasClass())}>{children}</div>
    </MarketplaceShell>
  );

  if (!profile) {
    return shell(
      <>
        <NativePageHeader title="Branch shops" subtitle="Create and monitor branches" showBack />
        <p className="px-4 pt-6 text-sm text-muted-foreground">Sign in to your business first.</p>
      </>,
    );
  }

  return shell(
    <>
      <NativePageHeader title="Branch shops" subtitle="Create logins, monitor, and switch" showBack />
      <div className="space-y-4 px-4 pb-24 pt-3">
        <p className="text-sm text-muted-foreground">
          Create a branch with its own username and password. Keep this headquarters login to watch posts and transactions, or switch into that shop.
        </p>

        {hq.length === 0 ? (
          <section className="rounded-[24px] border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-950">
            Open your main business first, then come back to add branches.
            <Link className="ml-2 font-extrabold text-[#1F7A4D]" to="/app/business">
              Business account
            </Link>
          </section>
        ) : null}

        {created ? (
          <section className="rounded-[24px] border border-[#1F7A4D]/30 bg-[#F4FBF7] p-4">
            <p className="text-[12px] font-extrabold uppercase tracking-wide text-[#1F7A4D]">Give this to the branch</p>
            <h2 className="mt-1 text-lg font-extrabold text-[#0B1F4D]">{created.businessName}</h2>
            <p className="mt-2 text-sm font-semibold">{created.email}</p>
            <p className="flex items-center gap-2 text-sm font-semibold">
              {showCreatedPassword ? created.password : "••••••••"}
              <PasswordToggle visible={showCreatedPassword} onToggle={() => setShowCreatedPassword((v) => !v)} />
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                className="h-10 rounded-2xl bg-[#1F7A4D] font-extrabold text-white"
                onClick={() => void workAsThisShop(created.id, created.businessName)}
              >
                Work as this branch
              </Button>
              <Link className="inline-flex h-10 items-center rounded-2xl border px-4 text-xs font-extrabold" to="/b/$slug" params={{ slug: created.username }}>
                Open shop
              </Link>
            </div>
          </section>
        ) : null}

        <form
          className="space-y-4 rounded-[24px] border border-border bg-white p-4 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="flex items-center gap-2">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-[#F4FBF7] text-[#1F7A4D]">
              <GitBranch className="size-5" />
            </span>
            <div>
              <h2 className="text-[15px] font-extrabold text-[#0B1F4D]">New branch</h2>
              <p className="text-[11px] text-muted-foreground">Their own shop login, under your headquarters.</p>
            </div>
          </div>

          {hq.length > 1 ? (
            <div>
              <FieldLabel>Under this shop</FieldLabel>
              <select
                className="h-12 w-full appearance-none rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] px-3 text-sm font-semibold"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                {hq.map((shop) => (
                  <option key={shop.id} value={shop.id}>
                    {shop.business_name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div>
            <FieldLabel>Branch name</FieldLabel>
            <div className="relative">
              <Store className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#1F7A4D]" />
              <Input
                className="h-12 rounded-2xl border-[#E5E7EB] bg-[#F8FAFC] pl-10 font-semibold"
                placeholder="e.g. TIJAR Wuse branch"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
              />
            </div>
          </div>

          <div>
            <FieldLabel>Username</FieldLabel>
            <div className="relative">
              <AtSign className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#1F7A4D]" />
              <Input
                className="h-12 rounded-2xl border-[#E5E7EB] bg-[#F8FAFC] pl-10 font-semibold"
                placeholder="wusebranch"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/^@/, ""))}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            <p className="mt-1.5 text-[13px] font-semibold text-[#0B1F4D]">Login email: {email || "username@tijar.ng"}</p>
            {usernameStatus !== "idle" ? (
              <p
                className={cn(
                  "mt-1 text-[12px] font-bold",
                  usernameStatus === "available" && "text-[#1F7A4D]",
                  usernameStatus === "taken" && "text-destructive",
                  usernameStatus === "invalid" && "text-amber-700",
                  usernameStatus === "checking" && "text-muted-foreground",
                )}
              >
                {usernameMessage}
              </p>
            ) : (
              <p className="mt-1 text-[12px] text-muted-foreground">Give this login to the person running the branch.</p>
            )}
          </div>

          <div>
            <FieldLabel>Password</FieldLabel>
            <div className="relative">
              <Input
                className="h-12 rounded-2xl border-[#E5E7EB] bg-[#F8FAFC] pr-12 font-semibold"
                type={showPassword ? "text" : "password"}
                placeholder="Password they will use"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
                <PasswordToggle visible={showPassword} onToggle={() => setShowPassword((v) => !v)} />
              </div>
            </div>
          </div>

          <div>
            <FieldLabel>Phone number</FieldLabel>
            <div className="relative">
              <Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#1F7A4D]" />
              <Input
                className="h-12 rounded-2xl border-[#E5E7EB] bg-[#F8FAFC] pl-10 font-semibold"
                placeholder="0803 000 0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
              />
            </div>
          </div>

          <div>
            <FieldLabel>Location</FieldLabel>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#1F7A4D]" />
              <Input
                className="h-12 rounded-2xl border-[#E5E7EB] bg-[#F8FAFC] pl-10 font-semibold"
                placeholder="Wuse 2, Abuja"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
          </div>

          <div>
            <FieldLabel>Category</FieldLabel>
            <div className="relative">
              <Tag className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#1F7A4D]" />
              <select
                className="h-12 w-full appearance-none rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] pl-10 pr-4 text-sm font-semibold"
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
            </div>
            {otherSelected || !categoryId ? (
              <Input
                className="mt-2 h-12 rounded-2xl border-[#E5E7EB] bg-[#F8FAFC] font-semibold"
                placeholder="If Other, write the category"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
              />
            ) : null}
          </div>

          <FileWell label="Logo" hint={logo ? logo.name : "Add a shop logo"} preview={logoPreview ? [logoPreview] : []} onFiles={(files) => setLogo(files[0] ?? null)} />
          <FileWell
            label="Pictures"
            hint={photos.length ? `${photos.length} of 5 selected` : "Up to 5 shop pictures"}
            preview={photoPreviews}
            multiple
            onFiles={(files) => setPhotos(files.slice(0, 5))}
          />

          <div>
            <FieldLabel>Product or service (optional)</FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              <select
                className="h-12 appearance-none rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] px-3 text-sm font-semibold"
                value={offerKind}
                onChange={(e) => setOfferKind(e.target.value === "service" ? "service" : "goods")}
              >
                <option value="goods">Product</option>
                <option value="service">Service</option>
              </select>
              <Input
                className="h-12 rounded-2xl border-[#E5E7EB] bg-[#F8FAFC] font-semibold"
                placeholder="Price ₦"
                value={offerPrice}
                onChange={(e) => setOfferPrice(e.target.value)}
                inputMode="decimal"
              />
            </div>
            <Input
              className="mt-2 h-12 rounded-2xl border-[#E5E7EB] bg-[#F8FAFC] font-semibold"
              placeholder="Name, e.g. Suya pack"
              value={offerName}
              onChange={(e) => setOfferName(e.target.value)}
            />
          </div>

          <Button
            type="submit"
            className="h-12 w-full rounded-2xl bg-[#1F7A4D] text-[15px] font-extrabold text-white hover:bg-[#19663F]"
            disabled={saving || hq.length === 0 || usernameStatus === "taken" || usernameStatus === "invalid" || usernameStatus === "checking"}
          >
            {saving ? "Creating branch…" : "Create branch"}
          </Button>
        </form>

        <section className="rounded-[24px] border border-border bg-white p-4 shadow-sm">
          <h2 className="text-[15px] font-extrabold text-[#0B1F4D]">Your branches</h2>
          {(shopsQuery.data?.shops ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">None yet. Create a branch and you can watch every post and transaction from here.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {(shopsQuery.data?.shops ?? []).map((shop) => {
                const open = openShopId === String(shop.id);
                const loginEmail = String(shop.login_email || `${shop.public_slug}@tijar.ng`);
                const loginPassword = String(shop.login_password ?? "");
                const stats = open ? detailQuery.data?.stats : null;
                return (
                  <li key={String(shop.id)} className="rounded-2xl bg-[#F8FAFC] px-3 py-2.5">
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 text-left"
                      onClick={() => {
                        setShowShopPassword(true);
                        setOpenShopId(open ? null : String(shop.id));
                      }}
                    >
                      <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#0B1F4D] text-sm font-extrabold text-white">
                        {shop.logo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={String(shop.logo_url)} alt="" className="size-full object-cover" />
                        ) : (
                          String(shop.business_name ?? "B").slice(0, 1).toUpperCase()
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-extrabold text-[#0B1F4D]">{String(shop.business_name)}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          @{String(shop.public_slug ?? "")} · {String(shop.public_location_label ?? "")}
                        </span>
                        <span className="block text-[11px] font-bold text-[#1F7A4D]">{open ? "Hide activity" : "Monitor activity"}</span>
                      </span>
                    </button>
                    {open ? (
                      <div className="mt-3 space-y-3 border-t border-border pt-3 text-sm">
                        <dl className="space-y-1.5">
                          <div className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">Email</dt>
                            <dd className="font-bold">{detailQuery.data?.shop?.email || loginEmail}</dd>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <dt className="text-muted-foreground">Password</dt>
                            <dd className="flex items-center gap-1 font-bold">
                              <span>{showShopPassword ? detailQuery.data?.shop?.password || loginPassword || "Opening…" : "••••••••"}</span>
                              <PasswordToggle visible={showShopPassword} onToggle={() => setShowShopPassword((v) => !v)} />
                            </dd>
                          </div>
                          <div className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">Phone</dt>
                            <dd className="font-bold">{String(shop.public_phone ?? "—")}</dd>
                          </div>
                        </dl>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="rounded-2xl bg-white p-2 text-center">
                            <p className="text-lg font-extrabold text-[#0B1F4D]">{stats?.posts ?? "—"}</p>
                            <p className="text-[10px] font-bold text-muted-foreground">Posts</p>
                          </div>
                          <div className="rounded-2xl bg-white p-2 text-center">
                            <p className="text-lg font-extrabold text-[#0B1F4D]">{stats?.products ?? "—"}</p>
                            <p className="text-[10px] font-bold text-muted-foreground">Products</p>
                          </div>
                          <div className="rounded-2xl bg-white p-2 text-center">
                            <p className="text-[13px] font-extrabold text-[#0B1F4D]">{stats ? money(stats.sales ?? 0) : "—"}</p>
                            <p className="text-[10px] font-bold text-muted-foreground">Sales</p>
                          </div>
                        </div>
                        {(detailQuery.data?.transactions ?? []).length > 0 ? (
                          <ul className="space-y-1">
                            {(detailQuery.data?.transactions ?? []).slice(0, 6).map((tx) => (
                              <li key={tx.id} className="flex justify-between gap-2 text-[12px]">
                                <span className="truncate font-semibold capitalize">{tx.description || tx.type}</span>
                                <span className="font-extrabold">{money(Number(tx.amount ?? 0))}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[12px] text-muted-foreground">{detailQuery.isLoading ? "Loading activity…" : "No transactions yet."}</p>
                        )}
                        {(detailQuery.data?.posts ?? []).slice(0, 3).map((post) => (
                          <p key={post.id} className="truncate text-[12px] text-muted-foreground">
                            {post.caption || "Post"}
                          </p>
                        ))}
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button
                            type="button"
                            className="h-10 rounded-2xl bg-[#1F7A4D] px-4 text-xs font-extrabold text-white"
                            onClick={() => void workAsThisShop(String(shop.id), String(shop.business_name))}
                          >
                            Work as this branch
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-10 rounded-2xl px-4 text-xs font-extrabold"
                            onClick={() => void loginAsThisShop(detailQuery.data?.shop?.email || loginEmail, detailQuery.data?.shop?.password || loginPassword)}
                          >
                            Sign in as this login
                          </Button>
                          <Link
                            className="inline-flex h-10 items-center rounded-2xl border px-4 text-xs font-extrabold"
                            to="/b/$slug"
                            params={{ slug: String(shop.public_slug || shop.id) }}
                          >
                            Open shop
                          </Link>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>,
  );
}
