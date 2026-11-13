import { createFileRoute } from "@tanstack/react-router";
import { ContactForm } from "@/components/forms";
import { PageHero } from "@/components/tijar-ui";
import { useTranslation } from "@/lib/i18n/context";
import { enMessages } from "@/lib/i18n/messages/en";
import { marketingSeo } from "@/lib/seo/catalog";

export const Route = createFileRoute("/contact")({
  head: () => marketingSeo(enMessages.meta.contact.title, enMessages.meta.contact.description, "/contact"),
  component: Page,
});

function Page() {
  const { t } = useTranslation();

  return (
    <>
      <PageHero
        eyebrow={t("pages.contact.heroEyebrow")}
        title={t("pages.contact.heroTitle")}
        copy={t("pages.contact.heroCopy")}
      />
      <section>
        <div className="mx-auto max-w-2xl px-5 py-24 sm:py-32">
          <ContactForm />
        </div>
      </section>
    </>
  );
}
