"use client";

import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Camera, CheckCircle2, Clock3, ImagePlus, LocateFixed, Store, XCircle } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { useAuth } from "@/features/auth/auth-context";
import { canUseBusinessMode, isCustomerOnly } from "@/lib/account-mode";
import { listBusinessCategories } from "@/services/business-service";
import {
  fetchMyBusinessUpgradeRequest,
  requestBusinessUpgrade,
  uploadUpgradeShopImage,
} from "@/services/marketplace-service";

export function BusinessApplyScreen() {
  const { profile, session } = useAuth();
  const navigate = useNavigate();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  const [businessName, setBusinessName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [whatsapp, setWhatsapp] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [shopFile, setShopFile] = useState<File | null>(null);
  const [shopPreview, setShopPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);

  const categoriesQuery = useQuery({
    queryKey: ["business-categories"],
    queryFn: async () => {
      const res = await listBusinessCategories();
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    staleTime: 300_000,
  });

  const existingQuery = useQuery({
    queryKey: ["business-upgrade-request", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      const res = await fetchMyBusinessUpgradeRequest(profile!.id);
      if (res.error) throw new Error(res.error);
      return res.request;
    },
  });

  if (!session || !profile) {
    return (
      <ApplyShell>
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <p className="font-bold">Sign in to apply for a business account</p>
          <Button className="mt-4 rounded-xl font-bold" asChild>
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
      </ApplyShell>
    );
  }

  if (canUseBusinessMode(profile) && !isCustomerOnly(profile)) {
    return (
      <ApplyShell>
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <CheckCircle2 className="mx-auto size-10 text-primary" />
          <p className="mt-3 font-extrabold">Your business account is ready</p>
          <p className="mt-1 text-sm text-muted-foreground">You can post products from Sell, or open the dashboard.</p>
          <Button className="mt-4 rounded-xl font-bold" asChild>
            <Link to="/shop/create">Start selling</Link>
          </Button>
          <Button variant="outline" className="mt-2 w-full rounded-xl font-bold" asChild>
            <Link to="/app">Open business dashboard</Link>
          </Button>
        </div>
      </ApplyShell>
    );
  }

  const existing = existingQuery.data;
  if (existing?.status === "approved") {
    return (
      <ApplyShell>
        <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <CheckCircle2 className="mx-auto size-10 text-primary" />
          <p className="mt-3 text-lg font-extrabold">Approved</p>
          <p className="mt-2 text-sm text-muted-foreground">
            You can now create your business account and start selling.
          </p>
          <Button className="mt-5 rounded-xl font-bold" asChild>
            <Link to="/app">Create business account</Link>
          </Button>
        </div>
      </ApplyShell>
    );
  }

  if (existing?.status === "pending") {
    return (
      <ApplyShell>
        <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <Clock3 className="mx-auto size-10 text-primary" />
          <p className="mt-3 text-lg font-extrabold">Request sent</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Your business application for <strong>{existing.business_name}</strong> is waiting for
            admin approval. Selling stays locked until then.
          </p>
          {existing.shop_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={existing.shop_image_url}
              alt=""
              className="mx-auto mt-4 size-28 rounded-2xl object-cover"
            />
          )}
          <Button className="mt-5 rounded-xl font-bold" asChild>
            <Link to="/shop">Continue shopping</Link>
          </Button>
        </div>
      </ApplyShell>
    );
  }

  if (existing?.status === "rejected") {
    // Allow re-apply below with a notice
  }

  function onPickShop(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Use a photo (JPG, PNG, WEBP, or GIF).");
      return;
    }
    setShopFile(file);
    setShopPreview(URL.createObjectURL(file));
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      toast.message("Location is not available on this device.");
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        if (!locationLabel.trim()) setLocationLabel("Near my current location");
        setGeoBusy(false);
        toast.success("Location captured");
      },
      () => {
        setGeoBusy(false);
        toast.message("Allow location access, or type your address below.");
      },
      { timeout: 12_000 },
    );
  }

  async function submit() {
    if (!businessName.trim()) return toast.error("Enter your business name");
    if (!categoryId) return toast.error("Choose a business category");
    if (!description.trim() || description.trim().length < 20) {
      return toast.error("Describe your business (at least 20 characters)");
    }
    if (!phone.trim()) return toast.error("Enter a contact phone number");
    if (!street.trim()) return toast.error("Enter your shop street / landmark");
    if (!city.trim()) return toast.error("Enter your city / town");
    if (!state.trim()) return toast.error("Enter your state");
    if (!shopFile) return toast.error("Add a shop photo so admin can review your business");

    setBusy(true);
    const uploaded = await uploadUpgradeShopImage(profile!.id, shopFile);
    if (uploaded.error || !uploaded.publicUrl) {
      setBusy(false);
      toast.error(uploaded.error ?? "Could not upload shop photo");
      return;
    }

    const locationLine = [street.trim(), city.trim(), state.trim()].filter(Boolean).join(", ");
    const { error } = await requestBusinessUpgrade({
      profileId: profile!.id,
      businessName,
      description,
      categoryId,
      location: locationLine,
      street,
      city,
      state,
      phone,
      ...(whatsapp.trim() ? { whatsapp } : {}),
      shopImageUrl: uploaded.publicUrl,
      latitude: lat,
      longitude: lng,
      ...(locationLabel.trim() ? { publicLocationLabel: locationLabel } : {}),
      ...(note.trim() ? { note } : {}),
    });
    setBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Application sent — waiting for admin approval.");
    void existingQuery.refetch();
    void navigate({ to: "/shop/create" });
  }

  return (
    <ApplyShell>
      <Link
        to="/shop/create"
        className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground"
      >
        <ArrowLeft className="size-4" /> Sell
      </Link>

      <section className="dashboard-summary-card rounded-2xl p-5 text-primary-foreground shadow-lg">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-white/70">
          <Store className="size-3.5" /> Business account
        </p>
        <h1 className="mt-1.5 text-xl font-extrabold">Apply to sell on TIJAR</h1>
        <p className="mt-1 text-sm text-white/85">
          Fill your shop details and photo. An admin will review before you get the business
          dashboard.
        </p>
      </section>

      {existing?.status === "rejected" && (
        <div className="mt-4 flex gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <XCircle className="mt-0.5 size-4 shrink-0" />
          <p>
            Your previous request was rejected
            {existing.note ? `: ${existing.note}` : "."} Update your details and send again.
          </p>
        </div>
      )}

      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-extrabold">Shop photo</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Snap a new photo or pick one from your gallery — shop front, stall, or products.
          </p>
          <div className="relative mt-3 flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-muted/40">
            {shopPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shopPreview} alt="" className="size-full object-cover" />
            ) : (
              <span className="flex flex-col items-center gap-2 text-muted-foreground">
                <Camera className="size-8" />
                <span className="text-sm font-semibold">Add a shop photo</span>
              </span>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button type="button" className="min-h-11 rounded-xl font-bold" onClick={() => cameraRef.current?.click()}>
              <Camera className="mr-1.5 size-4" />
              Snap
            </Button>
            <Button type="button" variant="outline" className="min-h-11 rounded-xl font-bold" onClick={() => libraryRef.current?.click()}>
              <ImagePlus className="mr-1.5 size-4" />
              From gallery
            </Button>
          </div>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              onPickShop(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          <input
            ref={libraryRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              onPickShop(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </section>

        <section className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-extrabold">Business details</h2>
          <div>
            <label className="text-xs font-semibold text-muted-foreground" htmlFor="biz-name">
              Business name *
            </label>
            <Input
              id="biz-name"
              className="mt-1 min-h-11 rounded-xl text-base"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g. Aisha Foods"
              required
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground" htmlFor="biz-cat">
              Category *
            </label>
            <select
              id="biz-cat"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base"
              required
            >
              <option value="">Select category</option>
              {(categoriesQuery.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground" htmlFor="biz-desc">
              What do you sell? *
            </label>
            <textarea
              id="biz-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-base"
              placeholder="Tell customers and admin about your products or services…"
              required
            />
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-extrabold">Contact</h2>
          <div>
            <label className="text-xs font-semibold text-muted-foreground" htmlFor="biz-phone">
              Phone *
            </label>
            <Input
              id="biz-phone"
              className="mt-1 min-h-11 rounded-xl text-base"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="080…"
              inputMode="tel"
              required
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground" htmlFor="biz-wa">
              WhatsApp (optional)
            </label>
            <Input
              id="biz-wa"
              className="mt-1 min-h-11 rounded-xl text-base"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="Same as phone or another number"
              inputMode="tel"
            />
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-extrabold">Shop location</h2>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 rounded-xl text-xs font-bold"
              disabled={geoBusy}
              onClick={useMyLocation}
            >
              <LocateFixed className="mr-1 size-3.5" />
              {geoBusy ? "…" : "Use GPS"}
            </Button>
          </div>
          {lat != null && lng != null && (
            <p className="text-xs font-semibold text-primary">
              GPS saved ({lat.toFixed(4)}, {lng.toFixed(4)})
            </p>
          )}
          <Input
            className="min-h-11 rounded-xl text-base"
            placeholder="Street / landmark *"
            value={street}
            onChange={(e) => setStreet(e.target.value)}
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              className="min-h-11 rounded-xl text-base"
              placeholder="City / town *"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              required
            />
            <Input
              className="min-h-11 rounded-xl text-base"
              placeholder="State *"
              value={state}
              onChange={(e) => setState(e.target.value)}
              required
            />
          </div>
          <Input
            className="min-h-11 rounded-xl text-base"
            placeholder="Public area label (e.g. Sabon Gari market)"
            value={locationLabel}
            onChange={(e) => setLocationLabel(e.target.value)}
          />
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <label className="text-xs font-semibold text-muted-foreground" htmlFor="biz-note">
            Note to admin (optional)
          </label>
          <Input
            id="biz-note"
            className="mt-1 min-h-11 rounded-xl text-base"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything else we should know"
          />
        </section>

        <p className="text-xs text-muted-foreground">
          Submitting does not open the business dashboard. An admin must approve your request first.
        </p>

        <Button type="submit" className="min-h-12 w-full rounded-xl font-bold" disabled={busy}>
          {busy ? "Sending request…" : "Send request for approval"}
        </Button>
      </form>
    </ApplyShell>
  );
}

function ApplyShell({ children }: { children: ReactNode }) {
  return (
    <MarketplaceShell hideTopBar variant="feed">
      <div
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {children}
      </div>
    </MarketplaceShell>
  );
}
