/**
 * Optional ElevenLabs Instant Voice Clone + TTS.
 * When ELEVENLABS_API_KEY is set, personal voice enrollment can create a clone
 * and /api/speak can use it. Without the key, OpenAI stock voices are used.
 */

import { sanitizeSecret } from "@/lib/secrets";
import { readEnvString } from "@/lib/supabase/runtime-env";

const DEFAULT_BASE = "https://api.elevenlabs.io/v1";

export function readElevenLabsApiKey(): string | null {
  const fromReader = readEnvString("ELEVENLABS_API_KEY");
  const fromProcess =
    typeof process !== "undefined" && process.env?.ELEVENLABS_API_KEY
      ? process.env.ELEVENLABS_API_KEY
      : undefined;
  return sanitizeSecret(fromReader ?? fromProcess);
}

export function isElevenLabsConfigured(): boolean {
  return Boolean(readElevenLabsApiKey());
}

/** Safe fingerprint for health checks — never the full secret. */
export function elevenLabsKeyFingerprint(apiKey: string | null = readElevenLabsApiKey()): {
  present: boolean;
  formatOk: boolean;
  length: number;
  hint: string | null;
} {
  if (!apiKey) return { present: false, formatOk: false, length: 0, hint: null };
  const formatOk = apiKey.startsWith("sk_") && apiKey.length >= 20;
  const hint =
    apiKey.length >= 8 ? `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}` : `${apiKey.slice(0, 2)}…`;
  return { present: true, formatOk, length: apiKey.length, hint };
}

export async function elevenLabsCloneVoice(input: {
  name: string;
  audio: Blob;
  filename?: string;
}): Promise<{ voiceId: string }> {
  const key = readElevenLabsApiKey();
  if (!key) throw new Error("ELEVENLABS_API_KEY is not configured.");

  const form = new FormData();
  form.append("name", input.name.slice(0, 80) || "TIJAR shopkeeper");
  form.append(
    "files",
    input.audio,
    input.filename ?? (input.audio.type.includes("mp4") ? "sample.m4a" : "sample.webm"),
  );
  form.append("description", "TIJAR personal shopkeeper voice");

  const res = await fetch(`${DEFAULT_BASE}/voices/add`, {
    method: "POST",
    headers: { "xi-api-key": key, Accept: "application/json" },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body.slice(0, 160) || `ElevenLabs clone failed (${res.status}).`);
  }

  const data = (await res.json()) as { voice_id?: string };
  if (!data.voice_id) throw new Error("ElevenLabs did not return a voice id.");
  return { voiceId: data.voice_id };
}

export async function elevenLabsTts(input: {
  voiceId: string;
  text: string;
}): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const key = readElevenLabsApiKey();
  if (!key) throw new Error("ELEVENLABS_API_KEY is not configured.");

  const res = await fetch(`${DEFAULT_BASE}/text-to-speech/${encodeURIComponent(input.voiceId)}`, {
    method: "POST",
    headers: {
      "xi-api-key": key,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: input.text.slice(0, 1000),
      model_id: "eleven_multilingual_v2",
    }),
  });

  if (!res.ok) {
    throw new Error(`ElevenLabs speech failed (${res.status}).`);
  }

  const bytes = await res.arrayBuffer();
  if (!bytes.byteLength) throw new Error("Empty audio from ElevenLabs.");
  return { bytes, contentType: res.headers.get("content-type") || "audio/mpeg" };
}
