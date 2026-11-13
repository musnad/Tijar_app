import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, CheckCircle2, Clock3, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeatureCard, LessonCard, PageHero, PhoneMockup, SectionIntro } from "@/components/tijar-ui";
import { useTranslation } from "@/lib/i18n/context";
import { enMessages } from "@/lib/i18n/messages/en";
import { marketingSeo } from "@/lib/seo/catalog";

export const Route = createFileRoute("/learn")({
  head: () => marketingSeo(enMessages.meta.learn.title, enMessages.meta.learn.description, "/learn"),
  component: Page,
});

function Page() {
  const { t } = useTranslation();

  return (
    <>
      <PageHero
        eyebrow={t("pages.learn.heroEyebrow")}
        title={t("pages.learn.heroTitle")}
        copy={t("pages.learn.heroCopy")}
      >
        <PhoneMockup screen="learn" />
      </PageHero>
      <section>
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-24 sm:py-32 lg:grid-cols-2 lg:items-center lg:px-6">
          <div>
            <SectionIntro
              title={t("pages.learn.introTitle")}
              copy={t("pages.learn.introCopy")}
            />
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <FeatureCard
                icon={Clock3}
                title={t("pages.learn.traits.short.title")}
                copy={t("pages.learn.traits.short.copy")}
              />
              <FeatureCard
                icon={MessageSquareText}
                title={t("pages.learn.traits.simple.title")}
                copy={t("pages.learn.traits.simple.copy")}
              />
              <FeatureCard
                icon={CheckCircle2}
                title={t("pages.learn.traits.practical.title")}
                copy={t("pages.learn.traits.practical.copy")}
              />
            </div>
          </div>
          <LessonCard />
        </div>
      </section>
      <section>
        <div className="mx-auto max-w-4xl px-5 py-18 text-center sm:py-24 lg:px-6">
          <BookOpen className="mx-auto size-10 text-primary" />
          <h2 className="mt-5 text-3xl font-extrabold sm:text-4xl">{t("pages.learn.closingTitle")}</h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
            {t("pages.learn.closingCopy")}
          </p>
          <Button asChild size="lg" className="mt-8">
            <Link to="/" hash="download-app">
              {t("common.getStarted")}
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
