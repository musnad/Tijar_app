"use client";

import type { ReactNode } from "react";

import { AppShell } from "@/features/app/app-shell";
import { useAuth } from "@/features/auth/auth-context";
import { VerifyToPostCard } from "@/features/business/verify-to-post";
import { usePrimaryBusiness } from "@/hooks/use-primary-business";
import { isShopIdentityVerified } from "@/lib/kyc/bytid";
import { useTranslation } from "@/lib/i18n/context";

export function SellerPage({
  children,
}: {
  children: (ctx: { businessId: string; profileId: string }) => ReactNode;
}) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { data, isLoading } = usePrimaryBusiness(profile?.id);
  const business = data?.business;

  return (
    <AppShell>
      {isLoading && <p className="mt-8 text-muted-foreground">…</p>}
      {!isLoading && !business && <p className="mt-8 text-sm text-destructive">{t("app.errors.noBusiness")}</p>}
      {business && profile && !isShopIdentityVerified(business) && <VerifyToPostCard />}
      {business && profile && isShopIdentityVerified(business) && children({ businessId: business.id, profileId: profile.id })}
    </AppShell>
  );
}
