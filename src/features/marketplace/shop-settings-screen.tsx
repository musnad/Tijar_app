"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, LogOut } from "lucide-react";
import { toast } from "sonner";

import { LanguageSelect } from "@/components/site-preferences-controls";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { MarketplaceShell } from "@/features/marketplace/marketplace-shell";
import { AccountModeSwitch } from "@/features/marketplace/account-mode-switch";
import { useAuth } from "@/features/auth/auth-context";
import { signOut } from "@/features/auth/auth-service";
import { canUseBusinessMode } from "@/lib/account-mode";
import { isTijarSuperAdminEmail } from "@/lib/admin";
import {
  fetchNotificationPreferences,
  saveNotificationPreferences,
} from "@/services/marketplace-service";
import { useTranslation } from "@/lib/i18n/context";
import type { NotificationPreferences } from "@/types/database";

export function ShopSettingsScreen() {
  const { t } = useTranslation();
  const { profile, session, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["notification-prefs", profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      const r = await fetchNotificationPreferences(profile!.id);
      if (r.error) throw new Error(r.error);
      return r.prefs;
    },
  });

  const prefsKey = ["notification-prefs", profile?.id] as const;

  const save = useMutation({
    mutationFn: (prefs: NotificationPreferences) => saveNotificationPreferences(prefs),
    onMutate: async (next: NotificationPreferences) => {
      await queryClient.cancelQueries({ queryKey: prefsKey });
      const previous = queryClient.getQueryData<NotificationPreferences>(prefsKey);
      queryClient.setQueryData(prefsKey, next);
      return { previous };
    },
    onError: (err: Error, _next, context) => {
      if (context?.previous) queryClient.setQueryData(prefsKey, context.previous);
      toast.error(err.message);
    },
    onSuccess: () => toast.success(t("shop.settings.saved"), { id: "notif-prefs-saved" }),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notification-prefs"] });
      await queryClient.invalidateQueries({ queryKey: ["activity-popup"] });
      await queryClient.invalidateQueries({ queryKey: ["activity-inbox"] });
    },
  });

  const prefs = query.data;

  /** Every category is delivered while the general master switch is on. */
  const allOn: NotificationPreferences | null = prefs
    ? { ...prefs, general: true, likes: true, comments: true, order_updates: true, enquiry_replies: true, followed_shops: true, marketing: true }
    : null;

  const categories: { key: keyof NotificationPreferences; label: string }[] = [
    { key: "likes", label: t("shop.settings.likes") },
    { key: "comments", label: t("shop.settings.comments") },
    { key: "order_updates", label: t("shop.settings.purchasesOrders") },
    { key: "enquiry_replies", label: t("shop.settings.shopReplies") },
    { key: "followed_shops", label: t("shop.settings.shopsIFollow") },
    { key: "marketing", label: t("shop.settings.tips") },
  ];

  return (
    <MarketplaceShell hideTopBar variant="feed">
      <div
        className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-[max(0.5rem,env(safe-area-inset-top))]"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <Link
          to="/shop/profile"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-muted-foreground"
        >
          <ArrowLeft className="size-4" /> {t("shop.settings.backProfile")}
        </Link>
        <h1 className="mt-2 text-[22px] font-extrabold tracking-tight text-[color:var(--brand-navy,#001B3A)]">
          {t("shop.settings.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("shop.settings.intro")}
        </p>

        {!session || !profile ? (
          <Button className="mt-6 min-h-11 w-full rounded-full font-bold" asChild>
            <Link to="/login">{t("shop.settings.signIn")}</Link>
          </Button>
        ) : (
          <div className="mt-5 space-y-4">
            <section className="rounded-2xl border border-border p-4">
              <p className="text-sm font-extrabold">{t("shop.settings.language")}</p>
              <div className="mt-2">
                <LanguageSelect />
              </div>
            </section>

            <section className="rounded-2xl border border-border p-4">
              <p className="text-sm font-extrabold">{t("shop.settings.account")}</p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">{t("shop.settings.shopOrBusiness")}</p>
                <AccountModeSwitch />
              </div>
              {canUseBusinessMode(profile) && (
                <Button variant="outline" className="mt-3 w-full rounded-xl font-bold" asChild>
                  <Link to="/app">{t("shop.settings.openDashboard")}</Link>
                </Button>
              )}
              {isTijarSuperAdminEmail(profile.email) && (
                <Button variant="outline" className="mt-2 w-full rounded-xl font-bold" asChild>
                  <Link to="/app/admin">{t("shop.settings.admin")}</Link>
                </Button>
              )}
            </section>

            <section className="rounded-2xl border border-border p-4">
              <p className="text-sm font-extrabold">{t("shop.settings.privacy")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("shop.settings.privacyCopy")}
              </p>
              {prefs && (
                <ul className="mt-3 space-y-3">
                  <NotifRow
                    label={t("shop.settings.generalNotifs")}
                    checked={prefs.general}
                    onChange={(general) =>
                      save.mutate(general && allOn ? allOn : { ...prefs, general: false })
                    }
                  />
                  {categories.map((row) => (
                    <NotifRow
                      key={row.key}
                      label={row.label}
                      checked={prefs.general || Boolean(prefs[row.key])}
                      locked={prefs.general}
                      onChange={(value) => save.mutate({ ...prefs, [row.key]: value })}
                    />
                  ))}
                </ul>
              )}
            </section>

            <Button
              type="button"
              variant="outline"
              className="min-h-12 w-full rounded-full font-bold"
              onClick={async () => {
                await signOut();
                await refreshProfile();
                void navigate({ to: "/shop" });
              }}
            >
              <LogOut className="mr-2 size-4" /> {t("shop.settings.logOut")}
            </Button>
          </div>
        )}
      </div>
    </MarketplaceShell>
  );
}

function NotifRow({
  label,
  checked,
  locked,
  onChange,
}: {
  label: string;
  checked: boolean;
  /** Locked on because the general master switch is on. */
  locked?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <li className="flex min-h-11 items-center justify-between gap-3">
      <span className={`text-sm font-medium ${locked ? "text-muted-foreground" : ""}`}>{label}</span>
      <Switch
        checked={checked}
        disabled={Boolean(locked)}
        aria-label={label}
        onCheckedChange={onChange}
      />
    </li>
  );
}
