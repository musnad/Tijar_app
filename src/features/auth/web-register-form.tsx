"use client";

import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AuthOrDivider, GoogleAuthButton, PasswordToggle, authIcons } from "@/features/auth/auth-ui";
import { signInWithEmail, signInWithGoogle, signUpWithEmail } from "@/features/auth/auth-service";
import { enterAppAfterAuth } from "@/features/auth/route-guards";
import { WebAuthLayout } from "@/features/auth/web-auth-layout";
import { WebAuthField, WebAuthSelect, WebPrimaryButton } from "@/features/auth/web-auth-fields";
import { registerSchema } from "@/features/onboarding/schemas";
import { useTranslation } from "@/lib/i18n/context";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/features/auth/auth-context";
import { SupabaseSetupNotice } from "@/features/auth/supabase-setup-notice";

const LOCATION_OPTIONS = [
  "Kano, Nigeria",
  "Lagos, Nigeria",
  "Abuja, Nigeria",
  "Kaduna, Nigeria",
  "Port Harcourt, Nigeria",
  "Ibadan, Nigeria",
  "Other",
];

export function WebRegisterForm() {
  const { t } = useTranslation();
  const { configured, configLoading } = useAuth();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [location, setLocation] = useState("");
  const [accountMode, setAccountMode] = useState<"customer" | "business">("customer");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = registerSchema.safeParse({
      fullName,
      phone,
      email,
      password,
      location,
      agreeTerms,
    });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message ?? "Invalid input");
      return;
    }
    setLoading(true);
    const { data, error } = await signUpWithEmail({
      email: parsed.data.email,
      password: parsed.data.password,
      fullName: parsed.data.fullName,
      phone: parsed.data.phone,
      location: parsed.data.location,
      accountMode,
    });
    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }
    if (accountMode === "business" && typeof window !== "undefined") {
      sessionStorage.setItem(
        "tijar-onboarding-prefill",
        JSON.stringify({
          businessName: parsed.data.fullName,
          location: parsed.data.location,
        }),
      );
    }
    let session = data.session;
    if (!session) {
      const signedIn = await signInWithEmail(parsed.data.email, parsed.data.password);
      if (signedIn.error || !signedIn.data.session) {
        setLoading(false);
        toast.message(signedIn.error?.message ?? t("app.register.checkEmail"));
        return;
      }
      session = signedIn.data.session;
    }
    if (!session) {
      setLoading(false);
      toast.error("Could not open your account. Try signing in.");
      return;
    }
    await enterAppAfterAuth({ prefer: accountMode === "customer" ? "shop" : "onboarding" });
  }

  async function onGoogle() {
    if (!agreeTerms) {
      toast.error("You must agree to the terms");
      return;
    }
    setGoogleLoading(true);
    const { error } = await signInWithGoogle({
      accountMode,
      next: accountMode === "customer" ? "/shop" : "/app/onboarding",
    });
    if (error) {
      setGoogleLoading(false);
      toast.error(error.message || t("auth.googleFailed"));
    }
  }

  if (configLoading) {
    return (
      <WebAuthLayout
        mode="register"
        title={t("auth.webRegisterTitle")}
        subtitle={t("auth.webRegisterSubtitle")}
      >
        <p className="text-center text-sm text-muted-foreground">…</p>
      </WebAuthLayout>
    );
  }

  if (!configured) {
    return (
      <WebAuthLayout
        mode="register"
        title={t("auth.webRegisterTitle")}
        subtitle={t("auth.webRegisterSubtitle")}
      >
        <SupabaseSetupNotice />
      </WebAuthLayout>
    );
  }

  return (
    <WebAuthLayout
      mode="register"
      title={t("auth.webRegisterTitle")}
      subtitle={t("auth.webRegisterSubtitle")}
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
        <div>
          <p className="mb-2 text-sm font-semibold text-[#001B3A]">I want to…</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAccountMode("customer")}
              className={`min-h-14 rounded-2xl border px-3 text-left text-sm font-bold ${
                accountMode === "customer"
                  ? "border-[#1B8A52] bg-[#e8faf0] text-[#001B3A]"
                  : "border-[#dce3eb] bg-white text-[#5a6578]"
              }`}
            >
              Buy things
              <span className="mt-0.5 block text-[11px] font-medium opacity-80">Shop marketplace</span>
            </button>
            <button
              type="button"
              onClick={() => setAccountMode("business")}
              className={`min-h-14 rounded-2xl border px-3 text-left text-sm font-bold ${
                accountMode === "business"
                  ? "border-[#1B8A52] bg-[#e8faf0] text-[#001B3A]"
                  : "border-[#dce3eb] bg-white text-[#5a6578]"
              }`}
            >
              Sell / run a shop
              <span className="mt-0.5 block text-[11px] font-medium opacity-80">Business dashboard</span>
            </button>
          </div>
        </div>
        <WebAuthField
          id="web-reg-name"
          label={t("app.register.fullName")}
          icon={authIcons.person}
          value={fullName}
          onChange={setFullName}
          placeholder={t("auth.fullNamePlaceholder")}
          autoComplete="name"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <WebAuthField
            id="web-reg-phone"
            label={t("auth.phone")}
            icon={authIcons.phone}
            type="tel"
            value={phone}
            onChange={setPhone}
            placeholder={t("auth.phonePlaceholder")}
            autoComplete="tel"
          />
          <WebAuthField
            id="web-reg-email"
            label={t("app.register.email")}
            icon={authIcons.mail}
            type="email"
            value={email}
            onChange={setEmail}
            placeholder={t("auth.emailPlaceholder")}
            autoComplete="email"
          />
        </div>
        <WebAuthField
          id="web-reg-password"
          label={t("app.register.password")}
          icon={authIcons.lock}
          type={passwordVisible ? "text" : "password"}
          value={password}
          onChange={setPassword}
          placeholder={t("auth.passwordCreatePlaceholder")}
          autoComplete="new-password"
          trailing={
            <PasswordToggle visible={passwordVisible} onToggle={() => setPasswordVisible((v) => !v)} />
          }
        />
        <WebAuthSelect
          id="web-reg-location"
          label={t("auth.location")}
          icon={authIcons.map}
          value={location}
          onChange={setLocation}
          placeholder={t("auth.locationPlaceholder")}
          options={LOCATION_OPTIONS.map((l) => ({ value: l, label: l }))}
        />
        <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug text-[#5a6578]">
          <Checkbox
            checked={agreeTerms}
            onCheckedChange={(v) => setAgreeTerms(v === true)}
            className="mt-0.5 border-[#c5d0db] data-[state=checked]:border-[#1B8A52] data-[state=checked]:bg-[#1B8A52]"
          />
          <span>
            {t("auth.agreeTerms")}{" "}
            <Link to="/terms" className="font-semibold text-[#2AA86A] hover:underline">
              {t("auth.terms")}
            </Link>{" "}
            {t("auth.and")}{" "}
            <Link to="/privacy" className="font-semibold text-[#2AA86A] hover:underline">
              {t("auth.privacy")}
            </Link>
          </span>
        </label>
        <WebPrimaryButton loading={loading}>{t("auth.createAccount")}</WebPrimaryButton>
      </form>
      <p className="mt-5 text-center text-sm text-[#6B7280]">
        {t("auth.hasAccount")}{" "}
        <Link to="/login" className="font-semibold text-[#1B8A52] hover:underline">
          {t("auth.logIn")}
        </Link>
      </p>
    </WebAuthLayout>
  );
}
