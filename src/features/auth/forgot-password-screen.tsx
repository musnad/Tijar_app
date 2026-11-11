"use client";

import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { authIcons } from "@/features/auth/auth-ui";
import { sendPasswordReset } from "@/features/auth/auth-service";
import { WebAuthField, WebPrimaryButton } from "@/features/auth/web-auth-fields";
import { WebAuthLayout } from "@/features/auth/web-auth-layout";
import { useTranslation } from "@/lib/i18n/context";
import { z } from "zod";

export function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = z.string().email().safeParse(email.trim());
    if (!parsed.success) {
      toast.error(t("app.login.email"));
      return;
    }
    setLoading(true);
    const { error } = await sendPasswordReset(parsed.data);
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSent(true);
    toast.success(t("app.login.resetSent"));
  }

  return (
    <WebAuthLayout
      mode="forgot"
      title={t("auth.forgotTitle")}
      subtitle={t("auth.forgotSubtitle")}
      footer={
        <p className="mt-5 text-center text-sm text-[#6B7280]">
          <Link to="/login" className="font-semibold text-[#1F7A4D] hover:underline">
            {t("auth.forgotBack")}
          </Link>
        </p>
      }
    >
      {sent ? (
        <div className="space-y-3 rounded-2xl bg-[#F3FBF6] px-4 py-3 text-sm text-[#1F7A4D]">
          <p className="font-semibold">{t("app.login.resetSent")}</p>
          <p className="font-medium text-[#0B1F4D]">{t("auth.forgotCheckInbox")}</p>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={onSubmit}>
          <WebAuthField
            id="forgot-email"
            label={t("app.register.email")}
            icon={authIcons.mail}
            type="email"
            value={email}
            onChange={setEmail}
            placeholder={t("auth.emailPlaceholder")}
            autoComplete="email"
          />
          <WebPrimaryButton loading={loading} variant="navy">
            {t("auth.forgotSubmit")}
          </WebPrimaryButton>
        </form>
      )}
    </WebAuthLayout>
  );
}
