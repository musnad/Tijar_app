import type { EmailOtpType, Session, SupabaseClient } from "@supabase/supabase-js";

import { markPasswordRecovery } from "@/lib/auth-recovery";
import {
  friendlyRecoveryError,
  isRecoveryCallback,
  parseAuthCallbackParams,
  stripAuthParamsFromUrl,
} from "@/lib/auth/recovery-params";

const OTP_TYPES: EmailOtpType[] = [
  "recovery",
  "magiclink",
  "signup",
  "invite",
  "email_change",
  "email",
];

function otpType(value: string | null): EmailOtpType {
  if (value && OTP_TYPES.includes(value as EmailOtpType)) return value as EmailOtpType;
  return "recovery";
}

let inflight: Promise<{ session: Session | null; recovery: boolean; error: string | null }> | null = null;

export async function completePasswordRecovery(
  supabase: SupabaseClient,
  href = typeof window === "undefined" ? "" : window.location.href,
): Promise<{ session: Session | null; recovery: boolean; error: string | null }> {
  if (inflight) return inflight;
  inflight = runCompletePasswordRecovery(supabase, href).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function runCompletePasswordRecovery(
  supabase: SupabaseClient,
  href: string,
): Promise<{ session: Session | null; recovery: boolean; error: string | null }> {
  if (!href) {
    const { data } = await supabase.auth.getSession();
    return { session: data.session, recovery: false, error: null };
  }

  const url = new URL(href, "https://www.tijar.ng");
  const params = parseAuthCallbackParams(href);
  const recovery = isRecoveryCallback(params, url.pathname);

  if (params.error) {
    const message = friendlyRecoveryError(params.errorDescription || params.error);
    stripAuthParamsFromUrl();
    return { session: null, recovery, error: message };
  }

  if (recovery) markPasswordRecovery();

  let error: string | null = null;

  if (params.code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);
    if (exchangeError) error = friendlyRecoveryError(exchangeError.message);
  } else if (params.tokenHash) {
    const { error: otpError } = await supabase.auth.verifyOtp({
      type: otpType(params.type),
      token_hash: params.tokenHash,
    });
    if (otpError) error = friendlyRecoveryError(otpError.message);
  } else if (params.accessToken && params.refreshToken) {
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: params.accessToken,
      refresh_token: params.refreshToken,
    });
    if (sessionError) error = friendlyRecoveryError(sessionError.message);
  }

  if (params.code || params.tokenHash || params.accessToken || params.error) {
    stripAuthParamsFromUrl();
  }

  const { data } = await supabase.auth.getSession();
  if (data.session && recovery) markPasswordRecovery();
  return { session: data.session, recovery, error };
}
