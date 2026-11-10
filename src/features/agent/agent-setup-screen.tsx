"use client";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AtSign,
  Camera,
  ImagePlus,
  MapPin,
  Phone,
  Store,
  Tag,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordToggle } from "@/features/auth/auth-ui";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { NativePageHeader, nativeCanvasClass } from "@/features/marketplace/native-page-header";
import { useAuth } from "@/features/auth/auth-context";
import { tijarShopEmail } from "@/lib/agent-email";
import { getMapsProvider } from "@/lib/maps/provider";
import { compressImageFile } from "@/lib/media/compress-upload";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
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
  password: string;
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
      const json = (await res.json()) as { shops?: Array<Record<string, unknown>>; agentId?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load shops.");
      return { shops: json.shops ?? [], agentId: json.agentId ?? "" };
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

  const slug = slugifyBusinessName(username);
  const email = slug ? tijarShopEmail(slug) : "";
  const categories = categoriesQuery.data ?? [];
  const otherSelected = /other/i.test(categories.find((c) => c.id === categoryId)?.slug ?? categoryId);
  const logoPreview = useMemo(() => (logo ? URL.createObjectURL(logo) : ""), [logo]);
  const photoPreviews = useMemo(() => photos.map((file) => URL.createObjectURL(file)), [photos]);

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
        const res = await fetch(`/api/agent/shops?username=${encodeURIComponent(typed)}`, {
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

  async function submit() {
    if (saving) return;
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
        JSON.stringify(
          offerName.trim() && price > 0 ? [{ kind: offerKind, name: offerName.trim(), price }] : [],
        ),
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
      toast.success("Shop is live and searchable.");
      await shopsQuery.refetch();
    } finally {
      setSaving(false);
    }
  }

  const shell = (children: ReactNode) => (
    <MarketplaceShell hideTopBar variant="feed">
      <div className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto", nativeCanvasClass())}>{children}</div>
    </MarketplaceShell>
  );

  if (!profile) {
    return shell(
      <>
        <NativePageHeader title="TIJAR agent" subtitle="Set up a business" showBack />
        <p className="px-4 pt-6 text-sm text-muted-foreground">Sign in as an agent first.</p>
      </>,
    );
  }

  if (rolesQuery.isLoading) {
    return shell(
      <>
        <NativePageHeader title="TIJAR agent" subtitle="Set up a business" showBack />
        <p className="px-4 pt-6 text-sm text-muted-foreground">Checking agent access…</p>
      </>,
    );
  }

  if (!isAgent) {
    return shell(
      <>
        <NativePageHeader title="TIJAR agent" subtitle="Set up a business" showBack />
        <div className="px-4 pt-6">
          <p className="font-extrabold text-[#0B1F4D]">Agents only</p>
          <p className="mt-1 text-sm text-muted-foreground">Ask TIJAR admin to make this account an agent.</p>
        </div>
      </>,
    );
  }

  return shell(
    <>
      <NativePageHeader title="Set up a business" subtitle="TIJAR agent" showBack />
      <div className="space-y-4 px-4 pb-10">
        <section className="overflow-hidden rounded-[28px] bg-[linear-gradient(145deg,#0B1F4D_0%,#14532d_58%,#1F7A4D_100%)] p-5 text-white shadow-[0_18px_40px_rgba(11,31,77,0.22)]">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-white/70">TIJAR agent</p>
          {shopsQuery.data?.agentId ? (
            <p className="mt-2 inline-flex rounded-full bg-white/15 px-3 py-1 text-[12px] font-extrabold tracking-wide">
              Agent ID {shopsQuery.data.agentId}
            </p>
          ) : null}
          <h2 className="mt-2 text-[22px] font-extrabold leading-tight">Create a shop they can log in to</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-white/85">
            Add a login, photos, phone and location so customers can search this business and call them for service.
          </p>
        </section>

        {created ? (
          <section className="rounded-[24px] border border-[#1F7A4D]/25 bg-white p-4 shadow-sm">
            <p className="text-sm font-extrabold text-[#1F7A4D]">{created.businessName} is live</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="font-bold">{created.email}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Username</dt>
                <dd className="font-bold">@{created.username}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Password</dt>
                <dd className="flex items-center gap-1 font-bold">
                  <span>{showCreatedPassword ? created.password : "••••••••"}</span>
                  <PasswordToggle visible={showCreatedPassword} onToggle={() => setShowCreatedPassword((v) => !v)} />
                </dd>
              </div>
            </dl>
            <Link
              className="mt-3 inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#1F7A4D] px-4 text-sm font-extrabold text-white"
              to="/b/$slug"
              params={{ slug: created.username }}
            >
              Open shop
            </Link>
          </section>
        ) : null}

        <form
          className="space-y-4 rounded-[24px] border border-border bg-white p-4 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div>
            <FieldLabel>Business name</FieldLabel>
            <div className="relative">
              <Store className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#1F7A4D]" />
              <Input
                className="h-12 rounded-2xl border-[#E5E7EB] bg-[#F8FAFC] pl-10 font-semibold"
                placeholder="e.g. Mama Chichi Foods"
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
                placeholder="Nailah"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/^@/, ""))}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            <p className="mt-1.5 text-[13px] font-semibold text-[#0B1F4D]">
              Login email: {email || "username@tijar.ng"}
            </p>
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
              <p className="mt-1 text-[12px] text-muted-foreground">We check if this @username and email are free.</p>
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
            <p className="mt-1 text-[11px] text-muted-foreground">At least 8 characters. Tap the eye to show or hide it.</p>
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

          <FileWell
            label="Logo"
            hint={logo ? logo.name : "Add a shop logo"}
            preview={logoPreview ? [logoPreview] : []}
            onFiles={(files) => setLogo(files[0] ?? null)}
          />
          <FileWell
            label="Pictures"
            hint={photos.length ? `${photos.length} of 5 selected` : "Up to 5 shop pictures"}
            preview={photoPreviews}
            multiple
            onFiles={(files) => setPhotos(files.slice(0, 5))}
          />
          <p className="text-[11px] text-muted-foreground">
            These pictures appear on Create post for this shop. If there is more than one, TIJAR posts the next picture every 24 hours.
          </p>

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
            <p className="mt-1 text-[11px] text-muted-foreground">If you add this, it goes on their products list and as a shop post people can search.</p>
          </div>

          <Button
            type="submit"
            className="h-12 w-full rounded-2xl bg-[#1F7A4D] text-[15px] font-extrabold text-white hover:bg-[#19663F]"
            disabled={saving || usernameStatus === "taken" || usernameStatus === "invalid" || usernameStatus === "checking"}
          >
            {saving ? "Creating shop…" : "Create shop"}
          </Button>
        </form>

        <section className="rounded-[24px] border border-border bg-white p-4 shadow-sm">
          <h2 className="text-[15px] font-extrabold text-[#0B1F4D]">Shops you set up</h2>
          {(shopsQuery.data?.shops ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">None yet. The first shop you create will appear here.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {(shopsQuery.data?.shops ?? []).map((shop) => (
                <li key={String(shop.id)} className="flex items-center gap-3 rounded-2xl bg-[#F8FAFC] px-3 py-2.5">
                  <Link
                    className="flex min-w-0 flex-1 items-center gap-3"
                    to="/shop/agent/$shopId"
                    params={{ shopId: String(shop.id) }}
                  >
                  <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#0B1F4D] text-sm font-extrabold text-white">
                    {shop.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={String(shop.logo_url)} alt="" className="size-full object-cover" />
                    ) : (
                      String(shop.business_name ?? "S").slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-extrabold text-[#0B1F4D]">{String(shop.business_name)}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      @{String(shop.public_slug ?? "")} · {String(shop.public_location_label ?? "")}
                    </span>
                    <span className="block text-[11px] font-bold text-[#1F7A4D]">View details</span>
                  </span>
                  </Link>
                  {shop.public_phone ? (
                    <a
                      className="flex size-10 items-center justify-center rounded-full bg-[#1F7A4D] text-white"
                      href={`tel:${String(shop.public_phone).replace(/[^\d+]/g, "")}`}
                      aria-label="Call shop"
                    >
                      <Phone className="size-4" />
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>,
  );
}
