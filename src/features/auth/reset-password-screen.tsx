"use client";

import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { authIcons, PasswordToggle } from "@/features/auth/auth-ui";
import { PasswordStrengthHints } from "@/features/auth/password-strength-hints";
import { signOut, updateAccountPassword } from "@/features/auth/auth-service";
import { passwordRequirementIssue } from "@/lib/auth/password-strength";
import { WebAuthField, WebPrimaryButton } from "@/features/auth/web-auth-fields";
import { WebAuthLayout } from "@/features/auth/web-auth-layout";
import { useAuth } from "@/features/auth/auth-context";
import { completePasswordRecovery } from "@/lib/auth/complete-recovery-session";
import { clearPasswordRecovery, isPasswordRecovery } from "@/lib/auth-recovery";
import { useTranslation } from "@/lib/i18n/context";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function ResetPasswordScreen() {
  const { t } = useTranslation();
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [checked, setChecked] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = getSupabaseBrowserClient();
      const result = await completePasswordRecovery(supabase);
      if (cancelled) return;
      if (result.error) {
        setLinkError(result.error);
        setReady(false);
        setChecked(true);
        return;
      }
      setReady(Boolean(result.session) || isPasswordRecovery());
      setChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const canReset = Boolean(session) || ready;

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
    await signOut();
    toast.success(t("auth.resetSaved"));
    void navigate({ to: "/login" });
  }

  const waiting = !checked || (loading && !session && !linkError && !ready);

  return (
    <WebAuthLayout
      mode="reset"
      title={t("auth.resetTitle")}
      subtitle={t("auth.resetSubtitle")}
      footer={
        <p className="mt-5 text-center text-sm text-[#6B7280]">
          <Link to="/forgot-password" className="font-semibold text-[#1F7A4D] hover:underline">
            {t("auth.forgotTitle")}
          </Link>
          {" · "}
          <Link to="/login" className="font-semibold text-[#1F7A4D] hover:underline">
            {t("auth.forgotBack")}
          </Link>
        </p>
      }
    >
      {waiting ? (
        <p className="text-sm text-[#6B7280]">{t("auth.resetWorking")}</p>
      ) : !canReset ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-[#0B1F4D]">{linkError || t("auth.resetNeedLink")}</p>
          <Link
            to="/forgot-password"
            className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#0B1F4D] px-4 text-sm font-bold text-white"
          >
            {t("auth.forgotSubmit")}
          </Link>
        </div>
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
