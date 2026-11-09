"use client";

import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { authIcons, PasswordToggle } from "@/features/auth/auth-ui";
import { PasswordStrengthHints } from "@/features/auth/password-strength-hints";
import { updateAccountPassword } from "@/features/auth/auth-service";
import { passwordRequirementIssue } from "@/lib/auth/password-strength";
import { resolveAppEntry } from "@/features/auth/route-guards";
import { WebAuthField, WebPrimaryButton } from "@/features/auth/web-auth-fields";
import { WebAuthLayout } from "@/features/auth/web-auth-layout";
import { useAuth } from "@/features/auth/auth-context";
import { clearPasswordRecovery } from "@/lib/auth-recovery";
import { useTranslation } from "@/lib/i18n/context";
import { fetchCurrentProfile } from "@/services/profile-service";

export function ResetPasswordScreen() {
  const { t } = useTranslation();
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const strengthIssue = passwordRequirementIssue(password);
    if (strengthIssue) {
      toast.error(strengthIssue);
      return;
    }
    if (password !== confirm) {
      toast.error(t("auth.resetMismatch"));
      return;
    }
    setSaving(true);
    const { error } = await updateAccountPassword(password);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    clearPasswordRecovery();
    toast.success(t("auth.resetSaved"));
    const { profile } = await fetchCurrentProfile();
    void navigate({ to: resolveAppEntry(profile, true) });
  }

  return (
    <WebAuthLayout
      mode="reset"
      title={t("auth.resetTitle")}
      subtitle={t("auth.resetSubtitle")}
      footer={
        <p className="mt-5 text-center text-sm text-[#6B7280]">
          <Link to="/login" className="font-semibold text-[#1F7A4D] hover:underline">
            {t("auth.forgotBack")}
          </Link>
        </p>
      }
    >
      {loading ? (
        <p className="text-sm text-[#6B7280]">…</p>
      ) : !session ? (
        <p className="text-sm font-semibold text-[#0B1F4D]">{t("auth.resetNeedLink")}</p>
      ) : (
        <form className="space-y-4" onSubmit={onSubmit}>
          <WebAuthField
            id="reset-password"
            label={t("auth.resetPasswordLabel")}
            icon={authIcons.lock}
            type={visible ? "text" : "password"}
            value={password}
            onChange={setPassword}
            placeholder={t("auth.passwordCreatePlaceholder")}
            autoComplete="new-password"
            trailing={<PasswordToggle visible={visible} onToggle={() => setVisible((v) => !v)} />}
          />
          <PasswordStrengthHints password={password} />
          <WebAuthField
            id="reset-confirm"
            label={t("auth.resetConfirmLabel")}
            icon={authIcons.lock}
            type={visible ? "text" : "password"}
            value={confirm}
            onChange={setConfirm}
            placeholder={t("auth.passwordCreatePlaceholder")}
            autoComplete="new-password"
          />
          <WebPrimaryButton loading={saving} variant="navy">
            {t("auth.resetSubmit")}
          </WebPrimaryButton>
        </form>
      )}
    </WebAuthLayout>
  );
}
