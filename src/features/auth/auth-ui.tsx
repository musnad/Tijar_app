"use client";

import {
  ArrowRight,
  ChevronDown,
  Eye,
  EyeOff,
  Lock,
  Mail,
  MapPin,
  PersonStanding,
  Phone,
  Shield,
  Store,
  UserPlus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { GoogleGIcon } from "@/features/auth/google-g-icon";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/context";

const TIJAR_BG = "#F4F6F8";
const TIJAR_NAVY = "#001B3A";
const TIJAR_GREEN = "#1B8A52";
const TIJAR_TEAL = "#2AA86A";

export function AuthScreen({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div
      className="relative min-h-screen overflow-x-hidden antialiased"
      style={{ backgroundColor: TIJAR_BG }}
    >
      <div className="pointer-events-none absolute -right-20 top-0 h-80 w-80 rounded-full bg-gradient-to-br from-[#1B8A52]/20 to-[#2AA86A]/5 blur-3xl" />
      <div className="pointer-events-none absolute -left-28 bottom-48 h-72 w-72 rounded-full bg-[#001B3A]/[0.04] blur-3xl" />
      <div className="relative mx-auto max-w-lg px-5 pb-36 pt-8 sm:pt-10">{children}</div>
      {footer ?? <LoginSecurityFooter />}
    </div>
  );
}

export function LoginTopHeader() {
  const { t } = useTranslation();
  return (
    <div className="relative mb-6 flex items-start justify-between gap-4">
      <div className="relative z-10 max-w-[210px] shrink-0 bg-transparent">
        <p className="text-[22px] font-extrabold tracking-[0.18em] text-[#001B3A]">TIJAR</p>
      </div>
      <div className="max-w-[130px] shrink-0 pt-1 text-right">
        <p className="text-[11px] leading-snug" style={{ color: TIJAR_NAVY }}>
          {t("auth.taglineSmall")}{" "}
          <span className="font-bold">{t("auth.taglineBold")}</span>
          <br />
          {t("auth.taglineBig")}
        </p>
        <div
          className="ml-auto mt-1.5 h-[3px] w-12 rounded-full"
          style={{
            background: `linear-gradient(90deg, ${TIJAR_GREEN}, ${TIJAR_TEAL})`,
          }}
        />
      </div>
    </div>
  );
}

export function RegisterTopHeader() {
  const { t } = useTranslation();
  return (
    <div className="relative mb-8 text-center">
      <div
        className="pointer-events-none absolute -right-6 top-0 h-24 w-24 opacity-30"
        style={{
          background: `radial-gradient(circle at 30% 30%, ${TIJAR_GREEN}55, transparent 70%)`,
        }}
      />
      <p className="text-[22px] font-extrabold tracking-[0.18em] text-[#001B3A]">TIJAR</p>
      <div
        className="mx-auto mt-4 h-1 w-16 rounded-full"
        style={{ backgroundColor: TIJAR_GREEN }}
      />
      <h1 className="mt-6 text-2xl font-extrabold" style={{ color: TIJAR_NAVY }}>
        {t("auth.registerWelcomeTitle")}
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[#5a6578]">
        {t("auth.registerWelcomeBody")}
      </p>
    </div>
  );
}

export function WelcomeBackHeading() {
  const { t } = useTranslation();
  return (
    <div className="mb-6 px-1">
      <h2 className="text-[28px] font-extrabold leading-tight" style={{ color: TIJAR_NAVY }}>
        {t("auth.welcome")}{" "}
        <span style={{ color: TIJAR_GREEN }}>{t("auth.welcomeAccent")}</span>
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-[#5a6578]">{t("auth.loginSubtitle")}</p>
    </div>
  );
}

export function AuthCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[#dce3ea] bg-white px-5 py-6 shadow-[0_8px_32px_rgba(0,27,58,0.08)] sm:px-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function AuthField({
  id,
  label,
  icon: Icon,
  type = "text",
  value,
  onChange,
  placeholder,
  trailing,
  autoComplete,
}: {
  id: string;
  label: string;
  icon: LucideIcon;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  trailing?: ReactNode;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-[#5a6578]">
        {label}
      </label>
      <div className="relative flex items-center">
        <Icon className="pointer-events-none absolute left-4 size-[18px] text-[#001B3A]" aria-hidden />
        <input
          id={id}
          type={type}
          autoComplete={autoComplete}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[52px] w-full rounded-[26px] border border-[#c5d0db] bg-white py-3 pl-12 pr-12 text-sm text-[#001B3A] outline-none ring-[#1B8A52]/30 placeholder:text-[#94a3b8] focus:border-[#2AA86A] focus:ring-2"
        />
        {trailing && <div className="absolute right-3 flex items-center">{trailing}</div>}
      </div>
    </div>
  );
}

export function PasswordToggle({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="rounded-full p-2 text-[#001B3A]/70 hover:bg-black/5"
      onClick={onToggle}
      aria-label={visible ? "Hide password" : "Show password"}
    >
      {visible ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
    </button>
  );
}

export function GradientLoginButton({
  loading,
  children,
}: {
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[26px] text-base font-semibold text-white shadow-md transition-opacity disabled:opacity-60"
      style={{
        background: `linear-gradient(90deg, ${TIJAR_NAVY}, #003d5c, ${TIJAR_TEAL})`,
      }}
    >
      {children}
      <ArrowRight className="size-5" />
    </button>
  );
}

export function GradientRegisterButton({
  loading,
  children,
}: {
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[26px] text-base font-semibold text-white shadow-md transition-opacity disabled:opacity-60"
      style={{
        background: `linear-gradient(90deg, ${TIJAR_GREEN}, #00a896)`,
      }}
    >
      <UserPlus className="size-5" />
      {children}
    </button>
  );
}

export function AuthOrDivider() {
  const { t } = useTranslation();
  return (
    <div className="my-5 flex items-center gap-3">
      <div className="h-px flex-1 bg-[#dce3ea]" />
      <span className="text-xs font-semibold tracking-wide text-[#94a3b8]">{t("auth.or")}</span>
      <div className="h-px flex-1 bg-[#dce3ea]" />
    </div>
  );
}

export function GoogleAuthButton({
  onClick,
  loading,
}: {
  onClick?: () => void;
  loading?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      className="flex min-h-[52px] w-full items-center justify-center gap-3 rounded-2xl border border-[#d7dee8] bg-white text-sm font-semibold text-[#0B1F4D] shadow-[0_1px_0_rgba(11,31,77,0.04)] transition hover:bg-[#f8fafc] disabled:opacity-60"
    >
      <GoogleGIcon className="size-5 shrink-0" />
      {loading ? "…" : t("auth.continueGoogle")}
    </button>
  );
}

export function RememberForgotRow({
  remember,
  onRemember,
  onForgot,
}: {
  remember: boolean;
  onRemember: (v: boolean) => void;
  onForgot: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-[#001B3A]">
        <Checkbox
          checked={remember}
          onCheckedChange={(v) => onRemember(v === true)}
          className="border-[#c5d0db] data-[state=checked]:border-[#1B8A52] data-[state=checked]:bg-[#1B8A52]"
        />
        {t("auth.rememberMe")}
      </label>
      <button
        type="button"
        className="text-sm font-medium text-[#1B8A52] hover:underline"
        onClick={onForgot}
      >
        {t("auth.forgotPassword")}
      </button>
    </div>
  );
}

export function AuthFooterLink({
  prompt,
  linkLabel,
  to,
}: {
  prompt: string;
  linkLabel: string;
  to: string;
}) {
  return (
    <p className="mt-6 text-center text-sm text-[#5a6578]">
      {prompt}{" "}
      <a href={to} className="font-semibold text-[#1B8A52] hover:underline">
        {linkLabel}
      </a>
    </p>
  );
}

export function LoginSecurityFooter() {
  const { t } = useTranslation();
  return (
    <div className="fixed bottom-0 left-0 right-0 z-10 h-[110px] overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(90deg, ${TIJAR_NAVY}, #002847, ${TIJAR_TEAL})`,
          clipPath: "ellipse(120% 100% at 50% 100%)",
        }}
      />
      <div className="absolute right-0 top-0 h-full w-[45%] max-w-[200px] overflow-hidden">
        <img
          src="/tijar-market-stall.jpg"
          alt=""
          className="h-full w-full object-cover opacity-75 mix-blend-luminosity"
        />
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(90deg, ${TIJAR_NAVY} 0%, transparent 55%)`,
          }}
        />
      </div>
      <div className="relative flex h-full max-w-lg items-center gap-3 px-5 pr-[42%]">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: TIJAR_GREEN }}
        >
          <Shield className="size-5 text-white" />
        </div>
        <p className="text-[11px] font-medium leading-snug text-white">{t("auth.securityFooter")}</p>
      </div>
    </div>
  );
}

export function RegisterWaveFooter() {
  return (
    <div
      className="pointer-events-none fixed bottom-0 left-0 right-0 h-16"
      style={{
        background: `linear-gradient(90deg, ${TIJAR_NAVY}, ${TIJAR_TEAL})`,
        clipPath: "ellipse(85% 100% at 50% 100%)",
      }}
    />
  );
}

export function AuthSelectField({
  id,
  label,
  icon: Icon,
  value,
  onChange,
  placeholder,
  options,
}: {
  id: string;
  label: string;
  icon: LucideIcon;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-[#5a6578]">
        {label}
      </label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-[#001B3A]" />
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[52px] w-full appearance-none rounded-[26px] border border-[#c5d0db] bg-white py-3 pl-12 pr-10 text-sm text-[#001B3A] outline-none focus:border-[#2AA86A] focus:ring-2 focus:ring-[#1B8A52]/30"
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-[#001B3A]" />
      </div>
    </div>
  );
}

export const authIcons = {
  mail: Mail,
  lock: Lock,
  phone: Phone,
  person: PersonStanding,
  store: Store,
  map: MapPin,
};
