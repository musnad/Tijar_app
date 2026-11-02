"use client";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BadgeCheck, MapPin, MessageCircle, Phone, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AREA_PRESETS } from "@/lib/maps/provider";
import { listBusinessCategories } from "@/services/business-service";
import { TIJAR_LANGUAGE_NAMES, type TijarLanguageName } from "@/lib/translation/languages";
import { fetchListingProductNames, fetchPublishedBusinesses } from "@/services/discover-service";
import { translateTextClient } from "@/services/translate-service";
import { useTranslation } from "@/lib/i18n/context";
import { filterListings, formatDistance } from "@/utils/discover";

const RADIUS_OPTIONS = [5, 10, 25, 50] as const;

export function DiscoverScreen() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [radiusKm, setRadiusKm] = useState<number>(25);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [centre, setCentre] = useState<{ lat: number; lng: number } | null>(null);
  const [centreLabel, setCentreLabel] = useState<string>("");
  const [geoMessage, setGeoMessage] = useState<string>("");
  const [searchLang, setSearchLang] = useState<TijarLanguageName>("English");
  const [translatedQuery, setTranslatedQuery] = useState<string | null>(null);
  const [searchNote, setSearchNote] = useState<string>("");

  const listingsQuery = useQuery({
    queryKey: ["discover-listings"],
    queryFn: async () => {
      const [listings, productNames] = await Promise.all([
        fetchPublishedBusinesses(),
        fetchListingProductNames(),
      ]);
      if (listings.error) throw new Error(listings.error);
      return listings.data.map((b) => ({ ...b, product_names: productNames.get(b.id) ?? [] }));
    },
    staleTime: 60_000,
  });

  const categoriesQuery = useQuery({
    queryKey: ["business-categories"],
    queryFn: async () => (await listBusinessCategories()).data,
    staleTime: 300_000,
  });

  const effectiveQuery = searchLang === "English" ? query : (translatedQuery ?? query);

  const results = useMemo(
    () =>
      filterListings(listingsQuery.data ?? [], {
        query: effectiveQuery,
        categoryId: categoryId || null,
        centre,
        radiusKm: centre ? radiusKm : null,
        verifiedOnly,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listingsQuery.data, effectiveQuery, categoryId, centre, radiusKm, verifiedOnly],
  );

  async function translateSearch() {
    if (searchLang === "English" || !query.trim()) return;
    const result = await translateTextClient({ text: query.trim(), fromLanguage: searchLang, toLanguage: "English" });
    if (result.ok) {
      setTranslatedQuery(result.translatedText);
      setSearchNote(t("app.discover.searchingFor").replace("{translated}", result.translatedText).replace("{language}", searchLang).replace("{query}", query.trim()));
    } else {
      setSearchNote(result.message);
    }
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setGeoMessage(t("app.discover.locationUnavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCentre({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setCentreLabel(t("app.discover.yourLocation"));
        setGeoMessage("");
      },
      () => {
        // Denial must not block discovery (acceptance criterion)
        setGeoMessage(t("app.discover.locationDenied"));
      },
      { timeout: 10_000, maximumAge: 300_000 },
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-w-6xl sm:px-6 sm:py-8">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold sm:text-3xl">{t("app.discover.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("app.discover.subtitle")}</p>
        </div>
        <Button size="sm" className="mt-0.5 shrink-0 rounded-xl font-bold" asChild>
          <Link to="/shop/nearby">Map</Link>
        </Button>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("app.discover.searchPlaceholder")}
            className="min-h-11 rounded-xl pl-9 text-base"
            aria-label={t("app.discover.searchAriaLabel")}
          />
        </div>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm sm:w-auto"
          aria-label={t("app.discover.categoryAriaLabel")}
        >
          <option value="">{t("app.discover.allCategories")}</option>
          {(categoriesQuery.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={searchLang}
          onChange={(e) => { setSearchLang(e.target.value as TijarLanguageName); setTranslatedQuery(null); setSearchNote(""); }}
          className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm sm:w-auto"
          aria-label={t("app.discover.searchLanguageAriaLabel")}
        >
          {TIJAR_LANGUAGE_NAMES.map((l) => (
            <option key={l} value={l}>{t("app.discover.searchIn").replace("{language}", l)}</option>
          ))}
        </select>
        {searchLang !== "English" && (
          <Button type="button" className="min-h-11 rounded-xl" onClick={translateSearch} disabled={!query.trim()}>
            {t("app.discover.translateSearch")}
          </Button>
        )}
      </div>
      {searchNote && <p className="mt-2 text-xs text-muted-foreground">{searchNote}</p>}

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible">
        <Button type="button" variant="outline" className="min-h-10 shrink-0 rounded-xl" onClick={useMyLocation}>
          <MapPin className="mr-1.5 size-4" /> {t("app.discover.nearMe")}
        </Button>
        <select
          value={centreLabel}
          onChange={(e) => {
            const preset = AREA_PRESETS.find((a) => a.name === e.target.value);
            if (preset) {
              setCentre({ lat: preset.lat, lng: preset.lng });
              setCentreLabel(preset.name);
            } else {
              setCentre(null);
              setCentreLabel("");
            }
          }}
          className="min-h-10 rounded-xl border border-input bg-background px-3 text-sm"
          aria-label={t("app.discover.chooseAreaAriaLabel")}
        >
          <option value="">{t("app.discover.allAreas")}</option>
          {AREA_PRESETS.map((a) => (
            <option key={a.name} value={a.name}>{a.name}</option>
          ))}
        </select>
        {centre && (
          <select
            value={radiusKm}
            onChange={(e) => setRadiusKm(Number(e.target.value))}
            className="min-h-10 rounded-xl border border-input bg-background px-3 text-sm"
            aria-label={t("app.discover.distanceAriaLabel")}
          >
            {RADIUS_OPTIONS.map((r) => (
              <option key={r} value={r}>{t("app.discover.withinKm").replace("{distance}", String(r))}</option>
            ))}
          </select>
        )}
        <label className="flex min-h-10 items-center gap-2 rounded-xl border border-input px-3 text-sm">
          <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} />
          {t("app.discover.verifiedOnly")}
        </label>
      </div>

      {geoMessage && <p className="mt-2 text-sm text-primary">{geoMessage}</p>}
      {centre && <p className="mt-2 text-xs text-muted-foreground">{t("app.discover.showingNear").replace("{name}", centreLabel || t("app.discover.selectedPoint"))}</p>}

      {listingsQuery.isLoading && <p className="mt-8 text-muted-foreground">{t("app.discover.loading")}</p>}
      {listingsQuery.isError && (
        <p className="mt-8 text-sm text-destructive">{t("app.discover.loadError")}</p>
      )}

      {listingsQuery.data && (
        <p className="mt-5 text-sm text-muted-foreground">{t(results.length === 1 ? "app.discover.shopFound" : "app.discover.shopsFound").replace("{count}", String(results.length))}</p>
      )}

      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((b) => (
            <li key={b.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <Link to="/b/$slug" params={{ slug: b.slug }} className="block p-4 active:bg-muted/30">
                <div className="flex items-start gap-3">
                  {b.logo_url ? (
                    <img src={b.logo_url} alt="" loading="lazy" className="size-12 rounded-xl object-cover" />
                  ) : (
                    <span className="flex size-12 items-center justify-center rounded-xl bg-muted font-extrabold">{b.business_name.slice(0, 1)}</span>
                  )}
                  <div className="min-w-0">
                    <p className="flex items-center gap-1 font-bold leading-tight">
                      <span className="truncate">{b.business_name}</span>
                      {b.is_verified && <BadgeCheck className="size-4 shrink-0 text-primary" aria-label={t("app.discover.verifiedByTijar")} />}
                    </p>
                    <p className="text-xs text-muted-foreground">{b.category_name ?? t("app.discover.defaultCategory")}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3.5 shrink-0" />
                      <span className="truncate">
                        {b.public_location_label ?? b.location_text ?? t("app.discover.areaOnShopPage")}
                        {b.distance_km != null && <> · {formatDistance(b.distance_km)}</>}
                      </span>
                    </p>
                  </div>
                </div>
                {b.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{b.description}</p>}
              </Link>
              <div className="flex flex-wrap gap-3 border-t border-border px-4 py-2.5">
                {b.public_phone && (
                  <a href={`tel:${b.public_phone}`} className="flex min-h-10 items-center gap-1 text-xs font-semibold text-primary"><Phone className="size-3.5" /> {t("app.discover.call")}</a>
                )}
                {b.public_whatsapp && (
                  <a href={`https://wa.me/${b.public_whatsapp.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer" className="flex min-h-10 items-center gap-1 text-xs font-semibold text-primary"><MessageCircle className="size-3.5" /> WhatsApp</a>
                )}
                <Link
                  to="/shop/nearby"
                  className="ml-auto flex min-h-10 items-center gap-1 text-xs font-bold text-primary"
                >
                  Buy nearby
                </Link>
              </div>
            </li>
          ))}
        </ul>

      {listingsQuery.data && results.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">{t("app.discover.emptyState")}</p>
        </div>
      )}
    </div>
  );
}
