import { createClient } from "@supabase/supabase-js";

import { readSupabasePublicEnv } from "@/lib/supabase/runtime-env";

function userClient(request: Request) {
  const env = readSupabasePublicEnv();
  if (!env) return null;
  const auth = request.headers.get("authorization") ?? "";
  return createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: auth.startsWith("Bearer ") ? { headers: { Authorization: auth } } : undefined,
  });
}

export async function ownsAiVideoRequest(request: Request, providerRequestId: string): Promise<boolean> {
  const supabase = userClient(request);
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("owns_ai_video_request", { p_ref: providerRequestId });
  if (error) return false;
  return data === true;
}

export async function ownsAiVoice(request: Request, voiceId: string): Promise<boolean> {
  const supabase = userClient(request);
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("owns_ai_voice", { p_voice_id: voiceId });
  if (error) return false;
  return data === true;
}

export async function bindAiVoice(request: Request, voiceId: string, jobId: string): Promise<boolean> {
  const supabase = userClient(request);
  if (!supabase) return false;
  const { error } = await supabase.rpc("bind_ai_voice", { p_voice_id: voiceId, p_job_id: jobId });
  return !error;
}
