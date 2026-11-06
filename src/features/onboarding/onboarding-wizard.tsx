"use client";

import { useNavigate } from "@tanstack/react-router";
import { Mic } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/features/auth/auth-context";
import { categoryDisplayName } from "@/features/onboarding/category-label";
import {
  DISCOVERY_CHANNEL_OPTIONS,
  GOAL_OPTIONS,
  MAX_GOALS,
  ONBOARDING_STEP_COUNT,
  PAYMENT_METHOD_OPTIONS,
  REVENUE_MODEL_OPTIONS,
} from "@/features/onboarding/constants";
import { OnboardingLanguageBar } from "@/features/onboarding/onboarding-language-bar";
import { MultiSelectOption, YesNoChoice } from "@/features/onboarding/multi-select";
import {
  normalizeOnboardingAnswers,
  onboardingWizardSchema,
  type OnboardingWizardAnswers,
} from "@/features/onboarding/schemas";
import { useSitePreferences, useTranslation } from "@/lib/i18n/context";
import { isLocale } from "@/lib/i18n/types";
import { completeBusinessSetup, listBusinessCategories } from "@/services/business-service";
import { updateProfile } from "@/services/profile-service";
import type { BusinessCategory } from "@/types/database";

type WizardState = Partial<
  Omit<OnboardingWizardAnswers, "islamicMode"> & { islamicMode?: "yes" | "not_now" }
>;

const defaultAnswers: WizardState = {
  revenueModels: [],
  paymentMethods: [],
  discoveryChannels: [],
  goals: [],
};

function toggle(list: string[], id: string, max?: number) {
  if (list.includes(id)) {
    return list.filter((x) => x !== id);
  }
  if (max !== undefined && list.length >= max) {
    return list;
  }
  return [...list, id];
}

export function OnboardingWizard() {
  const { t } = useTranslation();
  const { setLocale } = useSitePreferences();
  const navigate = useNavigate();
  const { profile, refreshProfile } = useAuth();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [categories, setCategories] = useState<BusinessCategory[]>([]);
  const [answers, setAnswers] = useState<WizardState>(defaultAnswers);

  useEffect(() => {
    if (!profile?.preferred_language || !isLocale(profile.preferred_language)) return;
    setLocale(profile.preferred_language);
  }, [profile?.preferred_language, setLocale]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem("tijar-onboarding-prefill");
    if (!raw) return;
    try {
      const pre = JSON.parse(raw) as {
        businessName?: string;
        categoryId?: string;
        location?: string;
      };
      setAnswers((a) => ({
        ...a,
        businessName: pre.businessName ?? a.businessName,
        categoryId: pre.categoryId ?? a.categoryId,
        location: pre.location ?? a.location,
      }));
      sessionStorage.removeItem("tijar-onboarding-prefill");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void listBusinessCategories().then(({ data, error }) => {
      if (error) toast.error(error);
      setCategories(data);
    });
  }, []);

  useEffect(() => {
    if (profile?.id && profile.onboarding_status === "not_started") {
      void updateProfile(profile.id, { onboarding_status: "in_progress" });
    }
  }, [profile?.id, profile?.onboarding_status]);

  const progress = (step / ONBOARDING_STEP_COUNT) * 100;

  const quickStepComplete =
    answers.customerCredit !== undefined &&
    answers.managesInventory !== undefined &&
    answers.hasStaff !== undefined &&
    answers.keepNotes !== undefined;

  const canContinue = useMemo(() => {
    switch (step) {
      case 1:
        return true;
      case 2:
        return Boolean(answers.businessName?.trim());
      case 3:
        return Boolean(answers.categoryId);
      case 4:
        return (answers.revenueModels?.length ?? 0) > 0;
      case 5:
        return (answers.paymentMethods?.length ?? 0) > 0;
      case 6:
        return quickStepComplete;
      case 7:
        return (answers.discoveryChannels?.length ?? 0) > 0;
      case 8:
        return (answers.goals?.length ?? 0) > 0;
      case 9:
        return answers.islamicMode === "yes" || answers.islamicMode === "not_now";
      default:
        return false;
    }
  }, [step, answers, quickStepComplete]);

  async function finish() {
    if (!profile?.id) {
      toast.error(t("app.errors.noProfile"));
      return;
    }
    const parsed = onboardingWizardSchema.safeParse({
      ...answers,
      location: answers.location ?? "Nigeria",
    });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message ?? t("app.errors.validation"));
      return;
    }
    const full = normalizeOnboardingAnswers(parsed.data);
    setSubmitting(true);
    const { businessId, error } = await completeBusinessSetup(profile.id, full);
    setSubmitting(false);
    if (error || !businessId) {
      toast.error(error ?? t("app.errors.saveFailed"));
      return;
    }
    await refreshProfile();
    toast.success(t("app.onboarding.completeToast"));
    void navigate({ to: "/app" });
  }

  function next() {
    if (step === 2 && !answers.location?.trim()) {
      setAnswers((a) => ({ ...a, location: "Nigeria" }));
    }
    if (step < ONBOARDING_STEP_COUNT) {
      setStep((s) => s + 1);
      return;
    }
    void finish();
  }

  function back() {
    setStep((s) => Math.max(1, s - 1));
  }

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-lg flex-col px-5 py-10">
      <OnboardingLanguageBar />
      <Progress value={progress} className="h-2" />
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("app.onboarding.step")} {step} / {ONBOARDING_STEP_COUNT}
      </p>

      <div className="mt-8 flex-1">
        {step === 1 && (
          <>
            <h1 className="text-2xl font-extrabold">{t("app.onboarding.welcomeTitle")}</h1>
            <p className="mt-3 text-muted-foreground">{t("app.onboarding.welcomeBody")}</p>
            <Button
              type="button"
              className="mt-6 min-h-12 w-full rounded-2xl bg-teal-700 font-bold hover:bg-teal-800"
              onClick={() => void navigate({ to: "/app/onboarding/voice" })}
            >
              <Mic className="mr-1.5 size-5" /> Use your voice instead
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Speak in English, Hausa, Swahili or Yoruba — TIJAR asks, you answer. You can also save
              your voice so TIJAR speaks back like you.
            </p>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="text-2xl font-extrabold">{t("app.onboarding.businessNameTitle")}</h1>
            <Label className="mt-6 block">{t("app.onboarding.businessNameLabel")}</Label>
            <Input
              className="mt-2 min-h-12"
              value={answers.businessName ?? ""}
              onChange={(e) => setAnswers((a) => ({ ...a, businessName: e.target.value }))}
              placeholder={t("app.onboarding.businessNamePlaceholder")}
            />
            <Label className="mt-4 block">{t("app.onboarding.locationLabel")}</Label>
            <Input
              className="mt-2 min-h-12"
              value={answers.location ?? ""}
              onChange={(e) => setAnswers((a) => ({ ...a, location: e.target.value }))}
              placeholder="Kano, Nigeria"
            />
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="text-2xl font-extrabold">{t("app.onboarding.categoryTitle")}</h1>
            <div className="mt-6 grid max-h-[50vh] gap-2 overflow-y-auto">
              {categories.map((cat) => (
                <MultiSelectOption
                  key={cat.id}
                  label={categoryDisplayName(cat, t)}
                  selected={answers.categoryId === cat.id}
                  onToggle={() => setAnswers((a) => ({ ...a, categoryId: cat.id }))}
                />
              ))}
              {categories.length === 0 && (
                <p className="text-sm text-destructive">{t("app.onboarding.noCategories")}</p>
              )}
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h1 className="text-2xl font-extrabold">{t("app.onboarding.revenueTitle")}</h1>
            <div className="mt-6 grid gap-2">
              {REVENUE_MODEL_OPTIONS.map((opt) => (
                <MultiSelectOption
                  key={opt.id}
                  label={t(opt.labelKey)}
                  selected={answers.revenueModels?.includes(opt.id) ?? false}
                  onToggle={() =>
                    setAnswers((a) => ({
                      ...a,
                      revenueModels: toggle(a.revenueModels ?? [], opt.id),
                    }))
                  }
                />
              ))}
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <h1 className="text-2xl font-extrabold">{t("app.onboarding.paymentsTitle")}</h1>
            <div className="mt-6 grid gap-2">
              {PAYMENT_METHOD_OPTIONS.map((opt) => (
                <MultiSelectOption
                  key={opt.id}
                  label={t(opt.labelKey)}
                  selected={answers.paymentMethods?.includes(opt.id) ?? false}
                  onToggle={() =>
                    setAnswers((a) => ({
                      ...a,
                      paymentMethods: toggle(a.paymentMethods ?? [], opt.id),
                    }))
                  }
                />
              ))}
            </div>
          </>
        )}

        {step === 6 && (
          <>
            <h1 className="text-2xl font-extrabold">{t("app.onboarding.quickBusinessTitle")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("app.onboarding.quickBusinessSubtitle")}
            </p>
            <div className="mt-6 space-y-6">
              <div>
                <p className="text-sm font-medium">{t("app.onboarding.customerCreditTitle")}</p>
                <div className="mt-2">
                  <YesNoChoice
                    value={answers.customerCredit ?? null}
                    onChange={(v) => setAnswers((a) => ({ ...a, customerCredit: v }))}
                    yesLabel={t("app.common.yes")}
                    noLabel={t("app.common.no")}
                  />
                </div>
              </div>
              <div>
                <p className="text-sm font-medium">{t("app.onboarding.inventoryTitle")}</p>
                <div className="mt-2">
                  <YesNoChoice
                    value={answers.managesInventory ?? null}
                    onChange={(v) => setAnswers((a) => ({ ...a, managesInventory: v }))}
                    yesLabel={t("app.common.yes")}
                    noLabel={t("app.common.no")}
                  />
                </div>
              </div>
              <div>
                <p className="text-sm font-medium">{t("app.onboarding.staffTitle")}</p>
                <div className="mt-2">
                  <YesNoChoice
                    value={answers.hasStaff ?? null}
                    onChange={(v) => setAnswers((a) => ({ ...a, hasStaff: v }))}
                    yesLabel={t("app.common.yes")}
                    noLabel={t("app.common.no")}
                  />
                </div>
              </div>
              <div>
                <p className="text-sm font-medium">{t("app.onboarding.keepNotesTitle")}</p>
                <div className="mt-2">
                  <YesNoChoice
                    value={answers.keepNotes ?? null}
                    onChange={(v) => setAnswers((a) => ({ ...a, keepNotes: v }))}
                    yesLabel={t("app.common.yes")}
                    noLabel={t("app.common.no")}
                  />
                </div>
              </div>
            </div>
          </>
        )}

        {step === 7 && (
          <>
            <h1 className="text-2xl font-extrabold">{t("app.onboarding.discoveryTitle")}</h1>
            <div className="mt-6 grid max-h-[50vh] gap-2 overflow-y-auto">
              {DISCOVERY_CHANNEL_OPTIONS.map((opt) => (
                <MultiSelectOption
                  key={opt.id}
                  label={t(opt.labelKey)}
                  selected={answers.discoveryChannels?.includes(opt.id) ?? false}
                  onToggle={() =>
                    setAnswers((a) => ({
                      ...a,
                      discoveryChannels: toggle(a.discoveryChannels ?? [], opt.id),
                    }))
                  }
                />
              ))}
            </div>
          </>
        )}

        {step === 8 && (
          <>
            <h1 className="text-2xl font-extrabold">{t("app.onboarding.goalsTitle")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{t("app.onboarding.goalsHint")}</p>
            <div className="mt-6 grid max-h-[50vh] gap-2 overflow-y-auto">
              {GOAL_OPTIONS.map((opt) => (
                <MultiSelectOption
                  key={opt.id}
                  label={t(opt.labelKey)}
                  selected={answers.goals?.includes(opt.id) ?? false}
                  onToggle={() =>
                    setAnswers((a) => ({
                      ...a,
                      goals: toggle(a.goals ?? [], opt.id, MAX_GOALS),
                    }))
                  }
                />
              ))}
            </div>
          </>
        )}

        {step === 9 && (
          <>
            <h1 className="text-2xl font-extrabold">{t("app.onboarding.islamicTitle")}</h1>
            <p className="mt-3 text-sm text-muted-foreground">{t("app.onboarding.islamicBody")}</p>
            <div className="mt-6 grid gap-2">
              <MultiSelectOption
                label={t("app.onboarding.islamicYes")}
                selected={answers.islamicMode === "yes"}
                onToggle={() => setAnswers((a) => ({ ...a, islamicMode: "yes" }))}
              />
              <MultiSelectOption
                label={t("app.onboarding.islamicNotNow")}
                selected={answers.islamicMode === "not_now"}
                onToggle={() => setAnswers((a) => ({ ...a, islamicMode: "not_now" }))}
              />
            </div>
            <p className="mt-4 text-xs text-muted-foreground">{t("app.onboarding.islamicDisclaimer")}</p>
          </>
        )}
      </div>

      <div className="mt-8 flex gap-3">
        {step > 1 && (
          <Button type="button" variant="outline" className="min-h-12 flex-1" onClick={back}>
            {t("app.common.back")}
          </Button>
        )}
        <Button
          type="button"
          className="min-h-12 flex-1"
          disabled={!canContinue || submitting}
          onClick={next}
        >
          {step === ONBOARDING_STEP_COUNT ? t("app.onboarding.finish") : t("app.common.continue")}
        </Button>
      </div>
    </div>
  );
}
