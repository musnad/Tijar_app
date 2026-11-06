"use client";

import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import {
  AuthCard,
  AuthField,
  AuthOrDivider,
  AuthScreen,
  GoogleAuthButton,
  GradientRegisterButton,
  PasswordToggle,
  RegisterTopHeader,
  RegisterWaveFooter,
  authIcons,
} from "@/features/auth/auth-ui";
import { signInWithEmail, signInWithGoogle, signUpWithEmail } from "@/features/auth/auth-service";
import { enterAppAfterAuth } from "@/features/auth/route-guards";
import { NigeriaAreaFields } from "@/features/location/nigeria-area-fields";
import { registerSchema } from "@/features/onboarding/schemas";
import { writeStoredUserArea } from "@/hooks/use-user-area";
import { formatNigerianLocation } from "@/lib/nigeria-locations";
import { useTranslation } from "@/lib/i18n/context";
import { Checkbox } from "@/components/ui/checkbox";

export function RegisterForm() {
  const { t } = useTranslation();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [stateName, setStateName] = useState("");
  const [lga, setLga] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const location = formatNigerianLocation(stateName, lga);
    const parsed = registerSchema.safeParse({
      fullName,
      phone,
      email,
      password,
      state: stateName,
      lga,
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
      state: parsed.data.state,
      lga: parsed.data.lga,
    });
    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }
    if (typeof window !== "undefined") {
      sessionStorage.setItem(
        "tijar-onboarding-prefill",
        JSON.stringify({
          businessName: parsed.data.fullName,
          location: parsed.data.location,
          state: parsed.data.state,
          lga: parsed.data.lga,
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
    writeStoredUserArea({ state: parsed.data.state, lga: parsed.data.lga });
    const { saveOwnArea } = await import("@/services/profile-service");
    await saveOwnArea({ state: parsed.data.state, lga: parsed.data.lga, location: parsed.data.location });
    await enterAppAfterAuth({ prefer: "onboarding" });
  }

  async function onGoogle() {
    if (!agreeTerms) {
      toast.error("You must agree to the terms");
      return;
    }
    setGoogleLoading(true);
    const { error } = await signInWithGoogle({ accountMode: "business", next: "/app/onboarding" });
    if (error) {
      setGoogleLoading(false);
      toast.error(error.message || t("auth.googleFailed"));
    }
  }

  return (
    <AuthScreen footer={<RegisterWaveFooter />}>
      <RegisterTopHeader />
      <form onSubmit={onSubmit}>
        <AuthCard className="space-y-4">
          <GoogleAuthButton loading={googleLoading} onClick={() => void onGoogle()} />
          <AuthOrDivider />
          <AuthField
            id="reg-name"
            label={t("app.register.fullName")}
            icon={authIcons.person}
            value={fullName}
            onChange={setFullName}
            placeholder={t("auth.fullNamePlaceholder")}
            autoComplete="name"
          />
          <AuthField
            id="reg-phone"
            label={t("auth.phone")}
            icon={authIcons.phone}
            type="tel"
            value={phone}
            onChange={setPhone}
            placeholder={t("auth.phonePlaceholder")}
            autoComplete="tel"
          />
          <AuthField
            id="reg-email"
            label={t("app.register.email")}
            icon={authIcons.mail}
            type="email"
            value={email}
            onChange={setEmail}
            placeholder={t("auth.emailPlaceholder")}
            autoComplete="email"
          />
          <AuthField
            id="reg-password"
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
          <NigeriaAreaFields
            variant="app"
            state={stateName}
            lga={lga}
            onState={setStateName}
            onLga={setLga}
          />
          <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug text-[#5a6578]">
            <Checkbox
              checked={agreeTerms}
              onCheckedChange={(v) => setAgreeTerms(v === true)}
              className="mt-0.5 border-[#c5d0db] data-[state=checked]:border-[#1B8A52] data-[state=checked]:bg-[#1B8A52]"
            />
            <span>
              {t("auth.agreeTerms")}{" "}
              <Link to="/terms" className="font-semibold text-[#1B8A52]">
                {t("auth.terms")}
              </Link>{" "}
              {t("auth.and")}{" "}
              <Link to="/privacy" className="font-semibold text-[#1B8A52]">
                {t("auth.privacy")}
              </Link>
            </span>
          </label>
          <GradientRegisterButton loading={loading}>{t("auth.createAccount")}</GradientRegisterButton>
        </AuthCard>
      </form>
      <p className="relative z-10 mt-8 pb-8 text-center text-sm text-[#5a6578]">
        {t("auth.hasAccount")}{" "}
        <Link to="/app/login" className="font-semibold text-[#1B8A52]">
          {t("auth.logIn")}
        </Link>
      </p>
    </AuthScreen>
  );
}
