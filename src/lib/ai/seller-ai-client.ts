import { getSupabaseBrowserClient } from "@/lib/supabase/client";

async function authHeaders(): Promise<HeadersInit> {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readError(res: Response): Promise<string> {
  const json = (await res.json().catch(() => null)) as
    | { error?: { message?: string } | string }
    | null;
  if (!json?.error) return `Request failed (${res.status}).`;
  if (typeof json.error === "string") return json.error;
  return json.error.message || `Request failed (${res.status}).`;
}

export async function aiPostJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as T;
}

export async function aiPostAudio(path: string, audio: Blob, language: string): Promise<{ transcript: string }> {
  const form = new FormData();
  form.append("audio", audio, "voice.webm");
  form.append("language", language);
  const res = await fetch(path, {
    method: "POST",
    headers: await authHeaders(),
    body: form,
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as { transcript: string };
}
