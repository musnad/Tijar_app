"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordStrengthHints } from "@/features/auth/password-strength-hints";
import { changePasswordWithVerification } from "@/features/auth/auth-service";
import { changePasswordSchema } from "@/features/profile/schemas";
import { useTranslation } from "@/lib/i18n/context";

export function ChangePasswordForm({ email }: { email: string }) {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    const parsed = changePasswordSchema.safeParse({
      currentPassword,
      newPassword,
      confirmPassword,
    });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message ?? t("app.errors.validation"));
      return;
    }

    setSaving(true);
    const { error } = await changePasswordWithVerification({
      email,
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
    });
    setSaving(false);

    if (error) {
      toast.error(error);
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    toast.success(t("app.profile.settings.passwordUpdated"));
  }

  return (
    <div className="space-y-3">
      <Input
        type="password"
        autoComplete="current-password"
        className="min-h-12 rounded-xl"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        placeholder={t("app.profile.settings.currentPassword")}
      />
      <Input
        type="password"
        autoComplete="new-password"
        className="min-h-12 rounded-xl"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        placeholder={t("app.profile.settings.newPassword")}
      />
      <PasswordStrengthHints password={newPassword} />
      <Input
        type="password"
        autoComplete="new-password"
        className="min-h-12 rounded-xl"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        placeholder={t("app.profile.settings.confirmPassword")}
      />
      <Button
        type="button"
        className="min-h-11 w-full rounded-xl font-bold"
        disabled={saving}
        onClick={() => void submit()}
      >
        {t("app.profile.settings.updatePassword")}
      </Button>
    </div>
  );
}
