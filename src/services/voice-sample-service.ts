import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { writePersonalVoicePrefs } from "@/lib/voice/personal-voice";

const BUCKET = "voice-samples";
const MAX_BYTES = 3 * 1024 * 1024;

export async function uploadVoiceSample(
  profileId: string,
  blob: Blob,
): Promise<{ path: string | null; error: string | null }> {
  if (blob.size < 2_000) {
    return { path: null, error: "Recording is too short. Speak for about 10–15 seconds." };
  }
  if (blob.size > MAX_BYTES) {
    return { path: null, error: "Recording is too large. Try a shorter clip." };
  }

  const supabase = getSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return { path: null, error: "Sign in again, then record your voice." };
  }

  const ext = (blob.type || "").includes("mp4") || (blob.type || "").includes("m4a") ? "m4a" : "webm";
  const path = `${profileId}/sample.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    upsert: true,
    contentType: blob.type || `audio/${ext}`,
  });

  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("bucket")) {
      return {
        path: null,
        error: "Voice storage is not set up yet. Run the personal voice migration in Supabase.",
      };
    }
    return { path: null, error: error.message };
  }

  writePersonalVoicePrefs({ voiceSamplePath: path });
  return { path, error: null };
}

export async function saveVoiceProfile(
  profileId: string,
  input: {
    voiceSamplePath?: string | null;
    preferredTtsVoice?: string | null;
  },
): Promise<{ error: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const patch: Record<string, unknown> = {
    voice_enrolled_at: new Date().toISOString(),
  };
  if (input.voiceSamplePath !== undefined) patch.voice_sample_path = input.voiceSamplePath;
  if (input.preferredTtsVoice !== undefined) patch.preferred_tts_voice = input.preferredTtsVoice;

  const { error } = await supabase.from("profiles").update(patch).eq("id", profileId);
  if (!error) {
    writePersonalVoicePrefs({
      voiceSamplePath: input.voiceSamplePath ?? undefined,
      preferredTtsVoice: input.preferredTtsVoice ?? undefined,
    });
  }
  return { error: error?.message ?? null };
}
