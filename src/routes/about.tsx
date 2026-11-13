import { createFileRoute } from "@tanstack/react-router";
import { Eye, HeartHandshake, Lightbulb, Users } from "lucide-react";
import { FeatureCard, FinalCta, PageHero, SectionIntro } from "@/components/tijar-ui";
import { useTranslation } from "@/lib/i18n/context";
import { enMessages } from "@/lib/i18n/messages/en";
import { marketingSeo } from "@/lib/seo/catalog";

export const Route = createFileRoute("/about")({
  head: () => marketingSeo(enMessages.meta.about.title, enMessages.meta.about.description, "/about"),
  component: Page,
});

function Page() {
  const { t } = useTranslation();

  return (
    <>
      <PageHero
        eyebrow={t("pages.about.heroEyebrow")}
        title={t("pages.about.heroTitle")}
        copy={t("pages.about.heroCopy")}
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-[1.25rem] bg-primary p-6 text-primary-foreground">
            <Users className="size-8" />
            <p className="mt-12 text-xl font-extrabold">{t("pages.about.highlightOwners")}</p>
          </div>
          <div className="mt-10 rounded-[1.25rem] bg-secondary p-6 text-secondary-foreground">
            <Eye className="size-8" />
            <p className="mt-12 text-xl font-extrabold">{t("pages.about.highlightVisibility")}</p>
          </div>
        </div>
      </PageHero>
      <section>
        <div className="mx-auto max-w-6xl px-5 py-24 sm:py-32 lg:px-6">
          <SectionIntro
            title={t("pages.about.introTitle")}
            copy={t("pages.about.introCopy")}
          />
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            <FeatureCard
              icon={HeartHandshake}
              title={t("pages.about.values.human.title")}
              copy={t("pages.about.values.human.copy")}
            />
            <FeatureCard
              icon={Lightbulb}
              title={t("pages.about.values.clear.title")}
              copy={t("pages.about.values.clear.copy")}
            />
            <FeatureCard
              icon={Eye}
              title={t("pages.about.values.visible.title")}
              copy={t("pages.about.values.visible.copy")}
            />
          </div>
        </div>
      </section>
      <section>
        <div className="mx-auto max-w-4xl px-5 py-18 text-center sm:py-24">
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
            {t("pages.about.philosophyEyebrow")}
          </p>
          <h2 className="mt-5 text-5xl font-extrabold sm:text-6xl">
            {t("pages.about.philosophyTitle")}
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
            {t("pages.about.philosophyCopy")}
          </p>
        </div>
      </section>
      <FinalCta />
    </>
  );
}
