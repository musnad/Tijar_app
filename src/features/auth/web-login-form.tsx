"use client";

import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AuthOrDivider, GoogleAuthButton, PasswordToggle, authIcons } from "@/features/auth/auth-ui";
import { signInWithEmail, signInWithGoogle } from "@/features/auth/auth-service";
import { WebAuthLayout } from "@/features/auth/web-auth-layout";
import { WebAuthField, WebPrimaryButton } from "@/features/auth/web-auth-fields";
import { loginSchema } from "@/features/onboarding/schemas";
import { enterAppAfterAuth } from "@/features/auth/route-guards";
import { useTranslation } from "@/lib/i18n/context";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/features/auth/auth-context";
import { SupabaseSetupNotice } from "@/features/auth/supabase-setup-notice";

export function WebLoginForm() {
  const { t } = useTranslation();
  const { configured, configLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const normalizedEmail = email.includes("@") ? email.trim() : "";
    if (!normalizedEmail) {
      toast.error(t("auth.phoneLoginSoon"));
      return;
    }
    const parsed = loginSchema.safeParse({ email: normalizedEmail, password });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message ?? "Invalid input");
      return;
    }
    setLoading(true);
    const { data, error } = await signInWithEmail(parsed.data.email, parsed.data.password);
    if (error || !data.session) {
      setLoading(false);
      toast.error(error?.message ?? "Sign-in did not complete. Try again.");
      return;
    }
    if (rememberMe && typeof window !== "undefined") {
      window.localStorage.setItem("tijar-remember-login", "1");
    }
    await enterAppAfterAuth();
  }

  async function onGoogle() {
    setGoogleLoading(true);
    const { error } = await signInWithGoogle();
    if (error) {
      setGoogleLoading(false);
      toast.error(error.message || t("auth.googleFailed"));
    }
  }

  if (configLoading) {
    return (
      <WebAuthLayout mode="login" title={t("auth.webLoginTitle")} subtitle={t("auth.webLoginSubtitle")}>
        <p className="text-center text-sm text-muted-foreground">…</p>
      </WebAuthLayout>
    );
  }

  if (!configured) {
    return (
      <WebAuthLayout mode="login" title={t("auth.webLoginTitle")} subtitle={t("auth.webLoginSubtitle")}>
        <SupabaseSetupNotice />
      </WebAuthLayout>
    );
  }

  return (
    <WebAuthLayout
      mode="login"
      title={t("auth.webLoginTitle")}
      subtitle={t("auth.webLoginSubtitle")}
      footer={
        <p className="mt-6 text-center text-sm text-[#5a6578]">
          <Link to="/" className="font-medium text-[#001B3A] underline-offset-2 hover:underline">
            {t("auth.backToHome")}
          </Link>
        </p>
      }
    >
      <GoogleAuthButton loading={googleLoading} onClick={() => void onGoogle()} />
      <AuthOrDivider />
      <form className="space-y-4" onSubmit={onSubmit}>
        <WebAuthField
          id="web-login-email"
          label={t("app.register.email")}
          icon={authIcons.mail}
          type="email"
          value={email}
          onChange={setEmail}
          placeholder={t("auth.emailPlaceholder")}
          autoComplete="email"
        />
        <WebAuthField
          id="web-login-password"
          label={t("auth.password")}
          icon={authIcons.lock}
          type={passwordVisible ? "text" : "password"}
          value={password}
          onChange={setPassword}
          placeholder={t("auth.passwordPlaceholder")}
          autoComplete="current-password"
          trailing={
            <PasswordToggle visible={passwordVisible} onToggle={() => setPasswordVisible((v) => !v)} />
          }
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[#001B3A]">
            <Checkbox
              checked={rememberMe}
              onCheckedChange={(v) => setRememberMe(v === true)}
              className="border-[#c5d0db] data-[state=checked]:border-[#1B8A52] data-[state=checked]:bg-[#1B8A52]"
            />
            {t("auth.rememberMe")}
          </label>
          <Link to="/forgot-password" className="text-sm font-semibold text-[#1F7A4D] hover:underline">
            {t("auth.forgotPassword")}
          </Link>
        </div>
        <WebPrimaryButton loading={loading} variant="navy">
          {t("auth.logIn")}
          <ArrowRight className="size-4" />
        </WebPrimaryButton>
      </form>
      <p className="mt-5 text-center text-sm text-[#6B7280]">
        {t("auth.noAccount")}{" "}
        <Link to="/register" className="font-semibold text-[#1B8A52] hover:underline">
          {t("auth.signUp")}
        </Link>
      </p>
    </WebAuthLayout>
  );
}
