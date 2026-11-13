import { createFileRoute, Link } from "@tanstack/react-router";
import { BadgeCheck, MapPin, Share2, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BusinessProfileCard,
  FeatureCard,
  FinalCta,
  PageHero,
  PhoneMockup,
  SectionIntro,
} from "@/components/tijar-ui";
import { useTranslation } from "@/lib/i18n/context";
import { enMessages } from "@/lib/i18n/messages/en";
import { marketingSeo } from "@/lib/seo/catalog";

export const Route = createFileRoute("/business-visibility")({
  head: () =>
    marketingSeo(enMessages.meta.businessVisibility.title, enMessages.meta.businessVisibility.description, "/business-visibility"),
  component: Page,
});

function Page() {
  const { t } = useTranslation();

  return (
    <>
      <PageHero
        eyebrow={t("pages.businessVisibility.heroEyebrow")}
        title={t("pages.businessVisibility.heroTitle")}
        copy={t("pages.businessVisibility.heroCopy")}
      >
        <PhoneMockup screen="business" />
      </PageHero>
      <section>
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-24 sm:py-32 lg:grid-cols-2 lg:items-center lg:px-6">
          <BusinessProfileCard />
          <div>
            <SectionIntro
              title={t("pages.businessVisibility.introTitle")}
              copy={t("pages.businessVisibility.introCopy")}
            />
            <Button asChild size="lg" className="mt-8">
              <Link to="/" hash="download-app">
                {t("download.getAppProfile")}
              </Link>
            </Button>
          </div>
        </div>
      </section>
      <section>
        <div className="mx-auto max-w-6xl px-5 py-24 sm:py-32 lg:px-6">
          <SectionIntro
            align="center"
            title={t("pages.businessVisibility.confidenceTitle")}
          />
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            <FeatureCard
              icon={BadgeCheck}
              title={t("pages.businessVisibility.features.verified.title")}
              copy={t("pages.businessVisibility.features.verified.copy")}
            />
            <FeatureCard
              icon={MapPin}
              title={t("pages.businessVisibility.features.find.title")}
              copy={t("pages.businessVisibility.features.find.copy")}
            />
            <FeatureCard
              icon={Share2}
              title={t("pages.businessVisibility.features.share.title")}
              copy={t("pages.businessVisibility.features.share.copy")}
            />
          </div>
          <p className="mt-8 text-center text-sm text-muted-foreground">
            <Store className="me-2 inline size-4" />
            {t("pages.businessVisibility.disclaimer")}
          </p>
        </div>
      </section>
      <FinalCta />
    </>
  );
}
