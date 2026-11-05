"use client";

import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormSection } from "@/features/app-layout/form-section";
import { UsernameField, type UsernameStatus } from "@/features/business/username-field";
import { ProfileAvatarField } from "@/features/profile/profile-avatar-field";
import { profileFormSchema } from "@/features/profile/schemas";
import { useAuth } from "@/features/auth/auth-context";
import { useTranslation } from "@/lib/i18n/context";
import { uploadProfileAvatar } from "@/services/profile-avatar-service";
import { shopUsername } from "@/lib/shop-names";
import { updateBusinessProfile } from "@/services/business-service";
import { updateProfile } from "@/services/profile-service";
import type { Business, Profile } from "@/types/database";
import { slugifyBusinessName } from "@/utils/discover";

export function EditProfileForm({
  profile,
  business,
  afterSave = "/app/profile",
}: {
  profile: Profile;
  business?: Business | null;
  afterSave?: "/app/profile" | "/shop/profile";
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { refreshProfile } = useAuth();

  const [businessName, setBusinessName] = useState(business?.business_name ?? "");
  const [username, setUsername] = useState(
    business ? shopUsername(business.business_name, business.public_slug) : "",
  );
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [fullName, setFullName] = useState(profile.full_name);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [saving, setSaving] = useState(false);

  async function submit() {
    const parsed = profileFormSchema.safeParse({
      fullName,
      phone: phone || undefined,
      bio: bio || undefined,
    });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message ?? t("app.errors.validation"));
      return;
    }

    setSaving(true);
    let nextAvatarUrl = avatarUrl;
    if (avatarFile) {
      const uploaded = await uploadProfileAvatar(profile.id, avatarFile);
      if (uploaded.error || !uploaded.publicUrl) {
        setSaving(false);
        toast.error(uploaded.error ?? t("app.errors.saveFailed"));
        return;
      }
      nextAvatarUrl = uploaded.publicUrl;
    }

    const { error } = await updateProfile(profile.id, {
      full_name: parsed.data.fullName,
      phone: parsed.data.phone || null,
      bio: parsed.data.bio || null,
      avatar_url: nextAvatarUrl,
    });
    if (error) {
      setSaving(false);
      toast.error(error.message);
      return;
    }
    if (business && businessName.trim().length >= 2) {
      if (usernameStatus === "taken" || usernameStatus === "invalid") {
        setSaving(false);
        toast.error(usernameStatus === "taken" ? "That username is not available." : "Pick a valid username.");
        return;
      }
      const biz = await updateBusinessProfile(
        business.id,
        {
          businessName: businessName.trim(),
          location: business.location ?? "",
          description: business.description ?? undefined,
          categoryId: business.category_id ?? undefined,
          islamicModeEnabled: business.islamic_mode_enabled,
          publicSlug: slugifyBusinessName(username) || slugifyBusinessName(businessName),
        },
        profile.id,
      );
      if (biz.error) {
        setSaving(false);
        toast.error(biz.error);
        return;
      }
    }
    setSaving(false);

    toast.success(t("app.profile.saved"));
    await refreshProfile();
    await queryClient.invalidateQueries({ queryKey: ["primary-business"] });
    void navigate({ to: afterSave });
  }

  return (
    <div className="mt-5 space-y-4 pb-8">
      <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-6 shadow-sm">
        <ProfileAvatarField
          name={fullName}
          avatarUrl={avatarUrl}
          editLabel={t("app.profile.changePhoto")}
          onFile={setAvatarFile}
        />
        <p className="mt-3 text-center text-xs text-muted-foreground">{t("app.profile.photoHint")}</p>
      </div>

      {business ? (
        <FormSection title={t("app.business.shopLabel")} hint="This name is shown on your shop, dashboard, and profile.">
          <Input
            className="min-h-12 rounded-xl"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder={t("app.business.namePlaceholder")}
          />
          <label className="mt-3 block text-xs font-bold text-muted-foreground">Username</label>
          <div className="mt-1">
            <UsernameField
              tone="light"
              value={username}
              exceptBusinessId={business.id}
              onChange={setUsername}
              onStatusChange={setUsernameStatus}
            />
          </div>
        </FormSection>
      ) : null}

      <FormSection title={t("app.profile.contactSection")} hint={t("app.profile.contactHint")}>
        <Input
          className="min-h-12 rounded-xl"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder={t("app.profile.namePlaceholder")}
        />
        <Input
          className="mt-3 min-h-12 rounded-xl"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t("app.profile.phonePlaceholder")}
          inputMode="tel"
        />
        <p className="mt-2 text-xs text-muted-foreground">{profile.email}</p>
      </FormSection>

      <FormSection title={t("app.profile.bioSection")} hint={t("app.profile.bioHint")}>
        <textarea
          className="min-h-24 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder={t("app.profile.bioPlaceholder")}
        />
      </FormSection>

      <Button
        type="button"
        className="min-h-12 w-full rounded-xl text-base font-bold"
        disabled={saving || (Boolean(business) && (usernameStatus === "taken" || usernameStatus === "invalid" || usernameStatus === "checking"))}
        onClick={() => void submit()}
      >
        {t("app.profile.save")}
      </Button>
    </div>
  );
}
