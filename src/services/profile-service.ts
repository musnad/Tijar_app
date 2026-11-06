import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";

export async function fetchCurrentProfile(): Promise<{
  profile: Profile | null;
  error: string | null;
}> {
  const supabase = getSupabaseBrowserClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { profile: null, error: authError?.message ?? null };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("auth_id", user.id)
    .maybeSingle();

  if (error) {
    return { profile: null, error: error.message };
  }

  return { profile: data as Profile | null, error: null };
}

export async function updateProfile(
  profileId: string,
  patch: Partial<
    Pick<
      Profile,
      | "full_name"
      | "phone"
      | "preferred_language"
      | "onboarding_status"
      | "avatar_url"
      | "bio"
      | "preferred_tts_voice"
      | "voice_sample_path"
      | "custom_voice_id"
      | "voice_enrolled_at"
      | "account_mode"
      | "active_mode"
      | "state"
      | "lga"
      | "location_text"
    >
  >,
) {
  const supabase = getSupabaseBrowserClient();
  return supabase.from("profiles").update(patch).eq("id", profileId).select().single();
}

export async function saveOwnArea(input: { state: string; lga: string; location: string }) {
  const { profile } = await fetchCurrentProfile();
  if (!profile) return;
  await supabaseSafeAreaUpdate(profile.id, input);
}

async function supabaseSafeAreaUpdate(
  profileId: string,
  input: { state: string; lga: string; location: string },
) {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      state: input.state,
      lga: input.lga || null,
      location_text: input.location,
    })
    .eq("id", profileId);
  if (error && /column|schema cache|does not exist/i.test(error.message)) return;
}
