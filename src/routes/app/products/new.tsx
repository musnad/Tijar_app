import { Link, createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { AppShell } from "@/features/app/app-shell";
import { AppPageHeader } from "@/features/app-layout/app-page-header";
import { BackLinkButton } from "@/features/app-layout/back-link-button";
import { RequireAuth } from "@/features/app/require-auth";
import { VerifyToPostCard } from "@/features/business/verify-to-post";
import { NewProductForm } from "@/features/products/new-product-form";
import { useAuth } from "@/features/auth/auth-context";
import { usePrimaryBusiness } from "@/hooks/use-primary-business";
import { shopQueryAllowsPost } from "@/lib/kyc/kyc-runtime";
import { useTranslation } from "@/lib/i18n/context";

export const Route = createFileRoute("/app/products/new")({
  component: NewProductPage,
});

function NewProductPage() {
  return (
    <RequireAuth>
      <NewProductPageContent />
    </RequireAuth>
  );
}

function NewProductPageContent() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { data, isLoading, isError, error, refetch } = usePrimaryBusiness(profile?.id);
  const business = data?.business;

  return (
    <AppShell>
      <AppPageHeader
        title={t("app.products.addTitle")}
        subtitle={t("app.products.addSubtitle")}
        action={<BackLinkButton to="/app/products" label={t("app.common.back")} />}
      />
      {isLoading && <p className="mt-8 text-muted-foreground">…</p>}
      {isError && (
        <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="font-semibold text-destructive">{t("app.products.loadFailed")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {error instanceof Error ? error.message : ""}
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 min-h-10 rounded-xl"
            onClick={() => void refetch()}
          >
            {t("app.common.retry")}
          </Button>
        </div>
      )}
      {!isLoading && !isError && !business && (
        <div className="mt-6 rounded-2xl border border-dashed border-border p-6 text-center">
          <p className="text-sm text-destructive">{t("app.errors.noBusiness")}</p>
          <p className="mt-2 text-xs text-muted-foreground">{t("app.products.needBusinessHint")}</p>
          <Button className="mt-4 min-h-11 rounded-xl font-bold" asChild>
            <Link to="/app/onboarding">{t("app.products.setupBusiness")}</Link>
          </Button>
        </div>
      )}
      {business && profile?.id && !shopQueryAllowsPost(data) && <VerifyToPostCard />}
      {business && profile?.id && shopQueryAllowsPost(data) && (
        <NewProductForm businessId={business.id} profileId={profile.id} />
      )}
    </AppShell>
  );
}
