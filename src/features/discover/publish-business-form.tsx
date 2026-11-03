"use client";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ExternalLink, MapPin, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/lib/i18n/context";
import { getMapsProvider, type GeocodeResult } from "@/lib/maps/provider";
import { TranslateText } from "@/features/translate/translate-text";
import { fetchProductsDashboard } from "@/services/product-analytics-service";
import { listBusinessCategories } from "@/services/business-service";
import { fetchBusinessEnquiries, isSlugAvailable, updateBusinessListing } from "@/services/discover-service";
import type { Business } from "@/types/database";
import { isValidSlug, listingCompleteness, slugifyBusinessName } from "@/utils/discover";

export function PublishBusinessForm({ business }: { business: Business }) {
  const { t } = useTranslation();
  const DAYS: [string, string][] = [
    ["mon", t("app.publish.dayMon")], ["tue", t("app.publish.dayTue")], ["wed", t("app.publish.dayWed")], ["thu", t("app.publish.dayThu")], ["fri", t("app.publish.dayFri")], ["sat", t("app.publish.daySat")], ["sun", t("app.publish.daySun")],
  ];
  const missingKeyByLabel: Record<string, string> = {
    "business name": "app.publish.missingBusinessName",
    "description": "app.publish.missingDescription",
    "storefront URL": "app.publish.missingStorefrontUrl",
    "map location": "app.publish.missingMapLocation",
    "public location approval": "app.publish.missingLocationApproval",
    "contact phone or WhatsApp": "app.publish.missingContact",
    "logo": "app.publish.missingLogo",
    "at least one product or service": "app.publish.missingProduct",
  };
  const [slug, setSlug] = useState(business.public_slug ?? slugifyBusinessName(business.business_name));
  const [published, setPublished] = useState(business.is_published);
  const [isInformal, setIsInformal] = useState(business.is_informal !== false);
  const [categoryId, setCategoryId] = useState(business.category_id ?? "");
  const [phone, setPhone] = useState(business.public_phone ?? "");
  const [whatsapp, setWhatsapp] = useState(business.public_whatsapp ?? "");
  const [lat, setLat] = useState<string>(business.latitude?.toString() ?? "");
  const [lng, setLng] = useState<string>(business.longitude?.toString() ?? "");
  const [locationLabel, setLocationLabel] = useState(business.public_location_label ?? business.location ?? "");
  const [approved, setApproved] = useState(business.location_approved);
  const [hours, setHours] = useState<Record<string, string>>(business.opening_hours ?? {});
  const [placeQuery, setPlaceQuery] = useState("");
  const [candidates, setCandidates] = useState<GeocodeResult[]>([]);
  const [saving, setSaving] = useState(false);

  const productsQuery = useQuery({
    queryKey: ["products-dashboard", business.id],
    queryFn: async () => (await fetchProductsDashboard(business.id)).data,
  });

  const categoriesQuery = useQuery({
    queryKey: ["business-categories"],
    queryFn: async () => (await listBusinessCategories()).data,
  });

  const enquiriesQuery = useQuery({
    queryKey: ["business-enquiries", business.id],
    queryFn: async () => (await fetchBusinessEnquiries(business.id)).data,
  });

  const completeness = useMemo(
    () =>
      listingCompleteness({
        business_name: business.business_name,
        description: business.description,
        public_slug: slug,
        latitude: lat ? Number(lat) : null,
        longitude: lng ? Number(lng) : null,
        location_approved: approved,
        public_phone: phone,
        public_whatsapp: whatsapp,
        logo_url: business.logo_url,
        productCount: productsQuery.data?.productCount ?? 0,
      }),
    [business, slug, lat, lng, approved, phone, whatsapp, productsQuery.data],
  );

  async function searchPlace() {
    const results = await getMapsProvider().geocode(placeQuery);
    setCandidates(results);
    if (results.length === 0) toast.message(t("app.publish.noPlacesFound"));
  }

  function useMyLocation() {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        toast.success(t("app.publish.locationCaptured"));
      },
      () => toast.error(t("app.publish.locationDenied")),
      { timeout: 10_000 },
    );
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    const cleanSlug = slug.trim().toLowerCase();
    if (cleanSlug && !isValidSlug(cleanSlug)) {
      toast.error(t("app.publish.slugInvalid"));
      return;
    }
    if (published && cleanSlug && !(await isSlugAvailable(cleanSlug, business.id))) {
      toast.error(t("app.publish.slugTaken"));
      return;
    }
    const latNum = lat ? Number(lat) : null;
    const lngNum = lng ? Number(lng) : null;
    if (published && (latNum === null || lngNum === null || !approved)) {
      toast.error(t("app.publish.publishNeedsLocation"));
      return;
    }
    setSaving(true);
    const { error } = await updateBusinessListing(business.id, {
      publicSlug: cleanSlug,
      isPublished: published,
      publicPhone: phone,
      publicWhatsapp: whatsapp,
      openingHours: Object.fromEntries(Object.entries(hours).filter(([, v]) => v.trim())),
      latitude: latNum,
      longitude: lngNum,
      publicLocationLabel: locationLabel,
      locationApproved: approved,
      isInformal,
      categoryId: categoryId || null,
    });
    setSaving(false);
    if (error) toast.error(error);
    else toast.success(published ? t("app.publish.savedPendingApproval") : t("app.publish.saved"));
  }

  return (
    <form onSubmit={onSave} className="mt-5 space-y-5">
      <div className="rounded-2xl border border-border p-4">
        <p className="font-bold">{t("app.publish.listingCompleteness").replace("{score}", String(completeness.score))}</p>
        {completeness.missing.length > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">{t("app.publish.stillNeeded").replace("{missing}", completeness.missing.map((label) => missingKeyByLabel[label] ? t(missingKeyByLabel[label]) : label).join(", "))}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          {t("app.publish.statusLabel").replace("{status}", business.moderation_status)}
          {business.moderation_status !== "approved" && t("app.publish.statusApprovalNote")}
        </p>
      </div>

      <label className="flex items-center gap-3 rounded-2xl border border-border p-4">
        <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} className="size-5" />
        <span><strong>{t("app.publish.publishTitle")}</strong><br /><span className="text-sm text-muted-foreground">{t("app.publish.publishSubtitle")}</span></span>
      </label>

      <label className="flex items-center gap-3 rounded-2xl border border-border p-4">
        <input
          type="checkbox"
          checked={isInformal}
          onChange={(e) => setIsInformal(e.target.checked)}
          className="size-5"
        />
        <span>
          <strong>Informal business (Marketplace)</strong>
          <br />
          <span className="text-sm text-muted-foreground">
            Only informal shops list products on TIJAR Marketplace. Uncheck if this is a formal registered business.
          </span>
        </span>
      </label>

      <div>
        <label className="text-sm font-semibold" htmlFor="slug">{t("app.publish.shopLink")}</label>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">tijar…/b/</span>
          <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} className="min-h-11 rounded-xl text-base" placeholder="aisha-foods" />
        </div>
        {published && slug && (
          <Link to="/b/$slug" params={{ slug }} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary">
            {t("app.publish.previewShopPage")} <ExternalLink className="size-3" />
          </Link>
        )}
      </div>

      <div>
        <label className="text-sm font-semibold" htmlFor="pub-category">
          Shop category
        </label>
        <select
          id="pub-category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="mt-1 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base"
        >
          <option value="">{categoriesQuery.isLoading ? "Loading categories…" : "Select category"}</option>
          {(categoriesQuery.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">
          Buyers can find your shop when they search by category.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-sm font-semibold" htmlFor="pub-phone">{t("app.publish.publicPhone")}</label>
          <Input id="pub-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 min-h-11 rounded-xl text-base" inputMode="tel" placeholder="0803…" />
        </div>
        <div>
          <label className="text-sm font-semibold" htmlFor="pub-wa">{t("app.publish.whatsappNumber")}</label>
          <Input id="pub-wa" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="mt-1 min-h-11 rounded-xl text-base" inputMode="tel" placeholder="234803…" />
        </div>
      </div>

      <fieldset className="rounded-2xl border border-border p-4">
        <legend className="flex items-center gap-1 px-1 font-bold"><MapPin className="size-4" /> {t("app.publish.shopLocation")}</legend>
        <p className="text-sm text-muted-foreground">{t("app.publish.locationHintBefore")}<strong>{t("app.publish.locationHintShop")}</strong>{t("app.publish.locationHintAfter")}</p>
        <div className="mt-3 flex gap-2">
          <Input value={placeQuery} onChange={(e) => setPlaceQuery(e.target.value)} placeholder={t("app.publish.searchAreaPlaceholder")} className="min-h-11 rounded-xl text-base" />
          <Button type="button" variant="outline" className="min-h-11 rounded-xl" onClick={searchPlace} aria-label={t("app.publish.search")}><Search className="size-4" /></Button>
        </div>
        {candidates.length > 0 && (
          <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
            {candidates.map((c) => (
              <li key={`${c.lat},${c.lng}`}>
                <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { setLat(c.lat.toFixed(6)); setLng(c.lng.toFixed(6)); setLocationLabel(c.label.split(",").slice(0, 2).join(",")); }}>
                  {c.label}
                </button>
              </li>
            ))}
          </ul>
        )}
        <Button type="button" variant="outline" className="mt-3 min-h-11 rounded-xl" onClick={useMyLocation}>{t("app.publish.useMyCurrentLocation")}</Button>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder={t("app.publish.latitude")} inputMode="decimal" className="min-h-11 rounded-xl" aria-label={t("app.publish.latitude")} />
          <Input value={lng} onChange={(e) => setLng(e.target.value)} placeholder={t("app.publish.longitude")} inputMode="decimal" className="min-h-11 rounded-xl" aria-label={t("app.publish.longitude")} />
          <Input value={locationLabel} onChange={(e) => setLocationLabel(e.target.value)} placeholder={t("app.publish.publicAreaLabel")} className="min-h-11 rounded-xl" aria-label={t("app.publish.publicAreaLabel")} />
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} className="mt-0.5 size-5" />
          {t("app.publish.approveLocation")}
        </label>
      </fieldset>

      <fieldset className="rounded-2xl border border-border p-4">
        <legend className="px-1 font-bold">{t("app.publish.openingHours")} <span className="text-xs font-normal text-muted-foreground">{t("app.publish.ownerProvided")}</span></legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {DAYS.map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <span className="w-10 font-semibold">{label}</span>
              <Input value={hours[k] ?? ""} onChange={(e) => setHours({ ...hours, [k]: e.target.value })} placeholder={t("app.publish.hoursPlaceholder")} className="min-h-10 rounded-xl" />
            </label>
          ))}
        </div>
      </fieldset>

      <p className="text-sm text-muted-foreground">
        {t("app.publish.productsNoteBefore")}<Link to="/app/products" className="font-semibold text-primary">{t("app.publish.productsNoteLink")}</Link>{t("app.publish.productsNoteAfter")}
      </p>

      <Button type="submit" disabled={saving} className="min-h-12 w-full rounded-xl font-bold">{saving ? t("app.publish.saving") : t("app.publish.saveShopListing")}</Button>

      <section className="rounded-2xl border border-border p-4">
        <h2 className="font-bold">{t("app.publish.customerEnquiries")}</h2>
        {(enquiriesQuery.data ?? []).length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">{t("app.publish.noEnquiries")}</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {(enquiriesQuery.data ?? []).map((enq) => (
              <li key={enq.id} className="rounded-xl bg-muted/60 p-3 text-sm">
                <p className="font-semibold">{enq.customer_name} {enq.customer_phone && <span className="font-normal text-muted-foreground">· {enq.customer_phone}</span>}</p>
                <p className="mt-0.5">{enq.message}</p>
                <TranslateText text={enq.message} label={t("app.publish.translateMessage")} allowSourceSelect />
                <p className="mt-0.5 text-xs text-muted-foreground">{new Date(enq.created_at).toLocaleString()}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </form>
  );
}
