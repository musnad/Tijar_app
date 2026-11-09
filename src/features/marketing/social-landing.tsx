import { Link } from "@tanstack/react-router";
import { ArrowRight, Heart, Landmark, Smartphone, Store, Video } from "lucide-react";

import { HeroFeedPhone } from "@/components/hero-feed-phone";
import { LandingDownloadCta } from "@/components/landing-gamification";
import { LanguageSelect } from "@/components/site-preferences-controls";
import { Button } from "@/components/ui/button";
import { useSitePreferences } from "@/lib/i18n/context";
import { LOCALE_LABELS, LOCALES, type Locale } from "@/lib/i18n/types";
import { useAuth } from "@/features/auth/auth-context";
import { updateProfile } from "@/services/profile-service";

const audienceKeys = [
  "home.audience.for.traders",
  "home.audience.for.food",
  "home.audience.for.tailors",
  "home.audience.for.beauty",
  "home.audience.for.mechanics",
  "home.audience.for.shops",
] as const;

const steps = [
  { key: "level1" as const, icon: Heart },
  { key: "level2" as const, icon: Landmark },
  { key: "level3" as const, icon: Video },
] as const;

const scenes = [
  { src: "/tijar-market-stall.jpg", label: "home.scenes.market", alt: "home.scenes.marketAlt", price: "₦2,500" },
  { src: "/tijar-tailor-shop.jpg", label: "home.scenes.tailor", alt: "home.scenes.tailorAlt", price: "₦18,000" },
  { src: "/tijar-food-stall.jpg", label: "home.scenes.food", alt: "home.scenes.foodAlt", price: "₦1,800" },
] as const;

export function SocialLanding() {
  const { t, locale, setLocale } = useSitePreferences();
  const { profile, refreshProfile } = useAuth();

  function pickLocale(next: Locale) {
    setLocale(next);
    if (profile?.id) {
      void updateProfile(profile.id, { preferred_language: next })
        .then(() => refreshProfile())
        .catch(() => {});
    }
  }

  return (
    <div data-marketing-landing className="bg-white text-[#0B1F4D]">
      <section className="overflow-hidden border-b border-[#EEF1F5] bg-[radial-gradient(ellipse_80%_50%_at_0%_0%,rgba(31,122,77,0.12),transparent_55%),radial-gradient(ellipse_50%_40%_at_100%_0%,rgba(11,31,77,0.08),transparent_50%)]">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-12 sm:py-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.9fr)] lg:gap-12 lg:px-6 lg:py-20">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#1F7A4D]">
              {t("home.audience.eyebrow")}
            </p>
            <h1 className="mt-4 max-w-xl text-[2.4rem] font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.4rem]">
              {t("home.heroTitle")}
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-[#4B5563] sm:text-lg sm:leading-8">
              {t("home.heroDesc")}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild size="lg" className="min-h-12 w-full rounded-full bg-[#1F7A4D] font-extrabold sm:w-auto">
                <Link to="/shop">
                  {t("home.openForYou")} <ArrowRight />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="min-h-12 w-full rounded-full border-2 border-[#0B1F4D] font-extrabold text-[#0B1F4D] sm:w-auto"
              >
                <Link to="/register">{t("home.startSelling")}</Link>
              </Button>
            </div>
            <p className="mt-4 text-sm font-semibold text-[#6B7280]">{t("home.heroHint")}</p>
            <div className="mt-5 max-w-xs">
              <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.16em] text-[#1F7A4D]">
                {t("nav.language")}
              </p>
              <LanguageSelect />
            </div>
          </div>
          <HeroFeedPhone className="lg:justify-self-end" />
        </div>
      </section>

      <section aria-label={t("home.scenes.label")} className="border-b border-[#EEF1F5]">
        <div className="mx-auto max-w-6xl px-5 py-10 lg:px-6">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#1F7A4D]">
            {t("home.scenes.eyebrow")}
          </p>
          <h2 className="mt-2 max-w-xl text-2xl font-extrabold sm:text-3xl">{t("home.scenes.title")}</h2>
          <ul className="mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] md:grid md:grid-cols-3 md:gap-4 md:overflow-visible [&::-webkit-scrollbar]:hidden">
            {scenes.map((scene) => (
              <li key={scene.src} className="w-[78%] shrink-0 snap-start md:w-auto">
                <article className="overflow-hidden rounded-3xl border border-[#EEF1F5] bg-white shadow-[0_8px_24px_-16px_rgba(11,31,77,0.35)]">
                  <div className="relative aspect-[4/5]">
                    <img
                      src={scene.src}
                      alt={t(scene.alt)}
                      width={800}
                      height={1000}
                      className="size-full object-cover"
                    />
                    <span className="absolute right-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-extrabold text-[#0B1F4D]">
                      {t(scene.label)}
                    </span>
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/75 to-transparent px-3 pb-3 pt-10">
                      <p className="text-sm font-extrabold text-white">{scene.price}</p>
                      <span className="rounded-full bg-[#1F7A4D] px-3 py-1.5 text-[11px] font-extrabold text-white">
                        {t("home.buyNow")}
                      </span>
                    </div>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-b border-[#EEF1F5]">
        <div className="mx-auto max-w-6xl px-5 py-14 lg:px-6 lg:py-20">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#1F7A4D]">
            {t("home.howItWorks.eyebrow")}
          </p>
          <h2 className="mt-2 max-w-xl text-3xl font-extrabold sm:text-4xl">{t("home.howItWorks.title")}</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.key} className="rounded-3xl border border-[#EEF1F5] bg-[#F8FAFC] p-5">
                  <span className="text-xs font-extrabold text-[#1F7A4D]">{String(index + 1).padStart(2, "0")}</span>
                  <Icon className="mt-4 size-7 text-[#0B1F4D]" strokeWidth={2} />
                  <h3 className="mt-3 text-xl font-extrabold">{t(`home.howItWorks.${step.key}.title`)}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#4B5563]">{t(`home.howItWorks.${step.key}.copy`)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto grid max-w-6xl gap-4 px-5 py-14 sm:grid-cols-2 lg:px-6 lg:py-20">
          <div className="rounded-3xl bg-[#0B1F4D] p-6 text-white sm:p-8">
            <Heart className="size-7" />
            <h2 className="mt-4 text-2xl font-extrabold">{t("home.shoppers.title")}</h2>
            <p className="mt-3 text-sm leading-7 text-white/80">{t("home.shoppers.copy")}</p>
            <Button asChild className="mt-6 min-h-11 rounded-full bg-[#1F7A4D] font-extrabold">
              <Link to="/shop">{t("home.openForYou")}</Link>
            </Button>
          </div>
          <div className="rounded-3xl border-2 border-[#0B1F4D] bg-white p-6 sm:p-8">
            <Store className="size-7 text-[#0B1F4D]" />
            <h2 className="mt-4 text-2xl font-extrabold">{t("home.sellers.title")}</h2>
            <p className="mt-3 text-sm leading-7 text-[#4B5563]">{t("home.sellers.copy")}</p>
            <Button
              asChild
              variant="outline"
              className="mt-6 min-h-11 rounded-full border-2 border-[#0B1F4D] font-extrabold text-[#0B1F4D]"
            >
              <Link to="/register">{t("home.startSelling")}</Link>
            </Button>
            <p className="mt-4 flex items-center gap-2 text-xs font-semibold text-[#6B7280]">
              <Smartphone className="size-4 text-[#1F7A4D]" />
              {t("home.sellers.payHint")}
            </p>
          </div>
        </div>
      </section>

      <section className="border-t border-[#EEF1F5] bg-[#F8FAFC]">
        <div className="mx-auto max-w-6xl px-5 py-12 lg:px-6">
          <p className="text-sm font-extrabold">{t("home.audience.title")}</p>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:flex-wrap [&::-webkit-scrollbar]:hidden">
            {audienceKeys.map((key) => (
              <span
                key={key}
                className="shrink-0 rounded-full bg-white px-3.5 py-2 text-sm font-semibold text-[#0B1F4D] shadow-sm ring-1 ring-[#EEF1F5]"
              >
                {t(key)}
              </span>
            ))}
          </div>
          <div className="mt-8">
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#1F7A4D]">
              {t("home.languages.eyebrow")}
            </p>
            <p className="mt-2 max-w-xl font-bold">{t("home.languages.title")}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {LOCALES.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => pickLocale(code)}
                  className={
                    code === locale
                      ? "rounded-full bg-[#1F7A4D] px-3 py-1.5 text-sm font-semibold text-white"
                      : "rounded-full bg-[#0B1F4D] px-3 py-1.5 text-sm font-semibold text-white"
                  }
                >
                  {LOCALE_LABELS[code]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <LandingDownloadCta />
    </div>
  );
}
