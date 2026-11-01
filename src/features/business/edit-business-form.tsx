"use client";

import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormSection } from "@/features/app-layout/form-section";
import { BusinessLogoField } from "@/features/business/business-logo-field";
import { TranslateText } from "@/features/translate/translate-text";
import { useAuth } from "@/features/auth/auth-context";
import { businessProfileFormSchema } from "@/features/business/schemas";
import { categoryDisplayName } from "@/features/onboarding/category-label";
import { useTranslation } from "@/lib/i18n/context";
import { uploadBusinessLogo } from "@/services/business-logo-service";
import { listBusinessCategories, updateBusinessProfile } from "@/services/business-service";
import type { Business } from "@/types/database";

export function EditBusinessForm({ business }: { business: Business }) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [businessName, setBusinessName] = useState(business.business_name);
  const [location, setLocation] = useState(business.location ?? "");
  const [phone, setPhone] = useState(business.public_phone ?? "");
  const [whatsapp, setWhatsapp] = useState(business.public_whatsapp ?? "");
  const [description, setDescription] = useState(business.description ?? "");
  const [categoryId, setCategoryId] = useState(business.category_id ?? "");
  const [islamicMode, setIslamicMode] = useState(Boolean(business.islamic_mode_enabled));
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoCleared, setLogoCleared] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: categories = [] } = useQuery({
    queryKey: ["business-categories"],
    queryFn: async () => {
      const result = await listBusinessCategories();
      if (result.error) throw new Error(result.error);
      return result.data;
    },
  });

  const logoPreview =
    logoCleared && !logoFile ? null : business.logo_url && !logoCleared ? business.logo_url : null;

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const parsed = businessProfileFormSchema.safeParse({
      businessName,
      location: location || undefined,
      description: description || undefined,
      categoryId: categoryId || undefined,
      islamicModeEnabled: islamicMode,
    });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message ?? t("app.errors.validation"));
      return;
    }
    if (!phone.trim() && !whatsapp.trim()) {
      toast.error("Add a contact phone or WhatsApp number so customers can reach your shop.");
      return;
    }

    setSaving(true);
    let logoUrl: string | null | undefined = undefined;
    if (logoCleared && !logoFile) {
      logoUrl = null;
    }
    if (logoFile) {
      const uploaded = await uploadBusinessLogo(business.id, logoFile);
      if (uploaded.error || !uploaded.publicUrl) {
        setSaving(false);
        toast.error(uploaded.error ?? t("app.errors.saveFailed"));
        return;
      }
      logoUrl = uploaded.publicUrl;
    }

    const { business: updated, error } = await updateBusinessProfile(
      business.id,
      {
        businessName: parsed.data.businessName,
        location: parsed.data.location ?? "",
        description: parsed.data.description,
        categoryId: parsed.data.categoryId || undefined,
        islamicModeEnabled: parsed.data.islamicModeEnabled,
        logoUrl,
        publicPhone: phone.trim() || null,
        publicWhatsapp: whatsapp.trim() || null,
      },
      profile?.id,
    );
    setSaving(false);

    if (error || !updated) {
      toast.error(error ?? t("app.errors.saveFailed"));
      return;
    }

    toast.success(t("app.business.saved"));
    await queryClient.invalidateQueries({ queryKey: ["primary-business"] });
    await queryClient.invalidateQueries({ queryKey: ["owned-businesses"] });
    await queryClient.invalidateQueries({ queryKey: ["marketplace-shops"] });
    await queryClient.invalidateQueries({ queryKey: ["storefront"] });
    void navigate({ to: "/app/business" });
  }

  return (
    <form className="mt-5 space-y-4 pb-8" onSubmit={(e) => void submit(e)}>
      <div className="dashboard-summary-card rounded-2xl p-4 text-primary-foreground shadow-lg sm:p-5">
        <BusinessLogoField
          previewUrl={logoPreview}
          onFile={(file) => {
            setLogoFile(file);
            setLogoCleared(false);
          }}
          onClear={() => {
            setLogoFile(null);
            setLogoCleared(true);
          }}
        />
        <label className="mt-4 block text-xs font-bold text-white/80">Business name</label>
        <Input
          className="mt-1 min-h-12 border-0 bg-white/10 text-lg font-bold text-white placeholder:text-white/40"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          placeholder={t("app.business.namePlaceholder")}
          required
        />
        <label className="mt-3 block text-xs font-bold text-white/80">Location</label>
        <Input
          className="mt-1 min-h-12 border-0 bg-white/10 text-sm text-white placeholder:text-white/40"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder={t("app.business.locationPlaceholder")}
        />
        <label className="mt-3 block text-xs font-bold text-white/80">Shop phone</label>
        <Input
          className="mt-1 min-h-12 border-0 bg-white/10 text-sm text-white placeholder:text-white/40"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="0803…"
          inputMode="tel"
        />
        <label className="mt-3 block text-xs font-bold text-white/80">WhatsApp</label>
        <Input
          className="mt-1 min-h-12 border-0 bg-white/10 text-sm text-white placeholder:text-white/40"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          placeholder="23480…"
          inputMode="tel"
        />
      </div>

      <FormSection title={t("app.business.aboutSection")} hint={t("app.business.aboutHint")}>
        <textarea
          className="min-h-24 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("app.business.descriptionPlaceholder")}
        />
        {description.trim() ? (
          <>
            <p className="mt-2 text-xs text-muted-foreground">
              Write in English, Yoruba, Swahili or Nigerian Pidgin, then translate. Review the translation before using it — nothing changes until you press Save.
            </p>
            <TranslateText
              text={description}
              label="Translate description"
              allowSourceSelect
              onUseTranslation={(translated) => setDescription(translated)}
            />
          </>
        ) : null}
      </FormSection>

      <FormSection title={t("app.business.categorySection")} hint={t("app.business.categoryHint")}>
        <select
          className="min-h-12 w-full rounded-xl border border-border bg-background px-3 text-sm"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">{t("app.business.categoryPlaceholder")}</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {categoryDisplayName(cat, t)}
            </option>
          ))}
        </select>
      </FormSection>

      <FormSection title={t("app.business.islamicSection")} hint={t("app.business.islamicHint")}>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setIslamicMode(true)}
            className={`flex-1 rounded-xl border py-3 text-sm font-bold ${
              islamicMode
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground"
            }`}
          >
            {t("app.common.yes")}
          </button>
          <button
            type="button"
            onClick={() => setIslamicMode(false)}
            className={`flex-1 rounded-xl border py-3 text-sm font-bold ${
              !islamicMode
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground"
            }`}
          >
            {t("app.common.no")}
          </button>
        </div>
      </FormSection>

      <Button type="submit" className="min-h-12 w-full rounded-xl text-base font-bold" disabled={saving}>
        {saving ? "Saving…" : t("app.business.save")}
      </Button>
    </form>
  );
}
