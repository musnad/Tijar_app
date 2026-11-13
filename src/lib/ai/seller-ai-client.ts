import { aiFetch, readAiError } from "@/lib/ai/client-fetch";

export async function aiPostJson<T>(path: string, body: unknown): Promise<T> {
  const res = await aiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await readAiError(res);
    throw new Error(err.message);
  }
  return (await res.json()) as T;
}

export async function aiPostAudio(path: string, audio: Blob, language: string): Promise<{ transcript: string }> {
  const form = new FormData();
  form.append("audio", audio, "voice.webm");
  form.append("language", language);
  const res = await aiFetch(path, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await readAiError(res);
    throw new Error(err.message);
  }
  return (await res.json()) as { transcript: string };
}
