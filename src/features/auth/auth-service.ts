import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { absoluteAppUrl } from "@/lib/site-url";

export async function signUpWithEmail(input: {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  categoryId?: string;
  location?: string;
  /** customer → marketplace; business → onboarding (default). */
  accountMode?: "customer" | "business";
}) {
  const supabase = getSupabaseBrowserClient();
  const mode = input.accountMode ?? "business";
  const emailRedirect = absoluteAppUrl(mode === "customer" ? "/shop" : "/app/onboarding");
  return supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      emailRedirectTo: emailRedirect.startsWith("http") ? emailRedirect : undefined,
      data: {
        full_name: input.fullName.trim(),
        phone: input.phone?.trim(),
        signup_category_id: input.categoryId,
        signup_location: input.location?.trim(),
        account_mode: mode,
      },
    },
  });
}

export async function signInWithEmail(email: string, password: string) {
  const supabase = getSupabaseBrowserClient();
  return supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
}

export async function signOut() {
  const supabase = getSupabaseBrowserClient();
  return supabase.auth.signOut();
}

export async function sendPasswordReset(email: string) {
  const supabase = getSupabaseBrowserClient();
  const redirectTo = absoluteAppUrl("/reset-password");
  return supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: redirectTo.startsWith("http") ? redirectTo : undefined,
  });
}

export async function updateAccountPassword(password: string) {
  const supabase = getSupabaseBrowserClient();
  return supabase.auth.updateUser({ password });
}

export async function signInWithGoogle(input?: { next?: string; accountMode?: "customer" | "business" }) {
  const supabase = getSupabaseBrowserClient();
  if (typeof window !== "undefined") {
    if (input?.accountMode) {
      window.sessionStorage.setItem("tijar-google-account-mode", input.accountMode);
    }
    if (input?.next) {
      window.sessionStorage.setItem("tijar-oauth-next", input.next);
    }
  }
  const redirectTo = absoluteAppUrl("/auth/callback");
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: redirectTo.startsWith("http") ? redirectTo : undefined,
      queryParams: { prompt: "select_account" },
    },
  });
}

export async function changePasswordWithVerification(input: {
  email: string;
  currentPassword: string;
  newPassword: string;
}): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: input.email.trim(),
    password: input.currentPassword,
  });
  if (verifyError) {
    return { error: verifyError.message };
  }
  const { error } = await supabase.auth.updateUser({ password: input.newPassword });
  return { error: error?.message ?? null };
}

export async function signOutAllDevices() {
  const supabase = getSupabaseBrowserClient();
  return supabase.auth.signOut({ scope: "global" });
}

export async function deleteOwnAccount(): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc("delete_own_account");
  if (error) {
    if (error.message.includes("Could not find the function")) {
      return {
        error: "Account deletion is not enabled on the server yet. Apply migration 20260307000008.",
      };
    }
    return { error: error.message };
  }
  await supabase.auth.signOut();
  return { error: null };
}

export function userHasPasswordLogin(user: { identities?: { provider: string }[] } | null): boolean {
  if (!user?.identities?.length) return true;
  return user.identities.some((i) => i.provider === "email");
}
