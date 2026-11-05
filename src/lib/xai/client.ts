/**
 * xAI Grok — server-only.
 * Text chat + translation fallback, image flyers, and photo/text-to-video.
 * Never prefix XAI_API_KEY with VITE_. Never log prompts, images, or the secret.
 */

import { sanitizeSecret } from "@/lib/secrets";
import { readEnvString } from "@/lib/supabase/runtime-env";

const DEFAULT_BASE = "https://api.x.ai/v1";
const DEFAULT_CHAT_MODEL = "grok-3-mini";
const KEY_NAMES = ["XAI_API_KEY", "GROK_API_KEY"] as const;

export class XaiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 502) {
    super(message);
    this.name = "XaiError";
    this.code = code;
    this.status = status;
  }
}

export function readXaiConfig(env?: Record<string, string | undefined>): { apiKey: string | null; baseUrl: string } {
  let apiKey: string | null = null;
  const names = env?.apiKey ? (["apiKey", ...KEY_NAMES] as const) : KEY_NAMES;
  for (const name of names) {
    const v = env ? env[name] : readEnvString(name) ?? (typeof process !== "undefined" ? process.env?.[name] : undefined);
    const cleaned = sanitizeSecret(typeof v === "string" ? v : undefined);
    if (cleaned) {
      apiKey = cleaned;
      break;
    }
  }
  const base = sanitizeSecret(env?.XAI_BASE_URL ?? readEnvString("XAI_BASE_URL")) || DEFAULT_BASE;
  return { apiKey, baseUrl: base.replace(/\/$/, "") };
}

export function xaiKeyFingerprint(apiKey: string | null): {
  present: boolean;
  formatOk: boolean;
  length: number;
  hint: string | null;
} {
  if (!apiKey) return { present: false, formatOk: false, length: 0, hint: null };
  const formatOk =
    apiKey.length >= 20 &&
    (/^xai[-_]/i.test(apiKey) || /^grok[_-]/i.test(apiKey) || apiKey.startsWith("sk-"));
  const hint = apiKey.length >= 8 ? `${apiKey.slice(0, 3)}…${apiKey.slice(-4)}` : `${apiKey.slice(0, 2)}…`;
  return { present: true, formatOk, length: apiKey.length, hint };
}

export function isXaiConfigured(): boolean {
  return Boolean(readXaiConfig().apiKey);
}

export type XaiClientConfig = {
  apiKey?: string;
  baseUrl?: string;
  chatModel?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

function resolveConfig(config: XaiClientConfig = {}): {
  apiKey: string;
  baseUrl: string;
  chatModel: string;
  timeoutMs: number;
} {
  const env = readXaiConfig();
  // Explicit apiKey (including "") wins so callers can force NOT_CONFIGURED.
  const rawKey = config.apiKey !== undefined ? config.apiKey : env.apiKey;
  const apiKey = rawKey?.trim() ? rawKey : undefined;
  if (!apiKey) {
    throw new XaiError("NOT_CONFIGURED", "Grok is not configured on this server (missing XAI_API_KEY).", 503);
  }
  return {
    apiKey,
    baseUrl: (config.baseUrl || env.baseUrl || DEFAULT_BASE).replace(/\/$/, ""),
    chatModel:
      config.chatModel ||
      sanitizeSecret(readEnvString("XAI_CHAT_MODEL")) ||
      DEFAULT_CHAT_MODEL,
    timeoutMs: config.timeoutMs ?? 45_000,
  };
}

async function xaiFetch(path: string, init: RequestInit, timeoutMs = 90_000): Promise<Response> {
  const { apiKey, baseUrl } = readXaiConfig();
  if (!apiKey) {
    throw new XaiError("NOT_CONFIGURED", "Grok is not configured on this server (missing XAI_API_KEY).", 503);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    return res;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new XaiError("TIMEOUT", "Grok took too long. Try again.", 504);
    }
    throw new XaiError("NETWORK", "Could not reach Grok. Try again.", 502);
  } finally {
    clearTimeout(timer);
  }
}

async function mapHttpError(res: Response): Promise<XaiError> {
  const text = await res.text().catch(() => "");
  if (res.status === 401 || res.status === 403 || /incorrect api key/i.test(text)) {
    return new XaiError(
      "INVALID_CREDENTIALS",
      "Grok key was rejected. Use an xAI key from https://console.x.ai (server XAI_API_KEY, not VITE_).",
      502,
    );
  }
  if (res.status === 429) return new XaiError("QUOTA_EXCEEDED", "Grok is rate-limited. Wait a minute.", 429);
  if (res.status === 400) return new XaiError("BAD_REQUEST", "Grok could not use that request.", 400);
  return new XaiError("PROVIDER_ERROR", "Grok could not finish this request.", 502);
}

/** Grok chat completion. Returns the assistant's text. */
export async function xaiChat(
  input: { system: string; user: string; temperature?: number; maxTokens?: number },
  config: XaiClientConfig = {},
): Promise<string> {
  const resolved = resolveConfig(config);
  const fetchImpl = config.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), resolved.timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(`${resolved.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resolved.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: resolved.chatModel,
        temperature: input.temperature ?? 0.4,
        max_tokens: input.maxTokens ?? 600,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user.slice(0, 4000) },
        ],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new XaiError("TIMEOUT", "Grok took too long. Try again.", 504);
    }
    throw new XaiError("NETWORK", "Could not reach Grok. Try again.", 502);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw await mapHttpError(res);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const out = data.choices?.[0]?.message?.content?.trim();
  if (!out) throw new XaiError("PROVIDER_ERROR", "Grok returned an empty reply.", 502);
  return out;
}

export async function grokChat(input: {
  system: string;
  user: string;
  json?: boolean;
  env?: XaiClientConfig;
}): Promise<string> {
  const system = input.json ? `${input.system}\nReturn valid JSON only.` : input.system;
  return xaiChat(
    { system, user: input.user, temperature: input.json ? 0.2 : 0.4, maxTokens: input.json ? 1200 : 600 },
    input.env ?? {},
  );
}

export async function grokJson<T>(input: {
  system: string;
  user: string;
  env?: XaiClientConfig;
}): Promise<T> {
  const raw = await grokChat({ ...input, json: true });
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] ?? trimmed).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new XaiError("PROVIDER_ERROR", "Grok returned no JSON.", 502);
  }
  try {
    return JSON.parse(body.slice(start, end + 1)) as T;
  } catch {
    throw new XaiError("PROVIDER_ERROR", "Grok returned invalid JSON.", 502);
  }
}

/** Translate text with Grok. Returns the plain translated string. */
export async function grokTranslate(
  input: { text: string; fromLanguage: string; toLanguage: string },
  config: XaiClientConfig = {},
): Promise<string> {
  const text = input.text.replace(/\s+/g, " ").trim();
  if (!text) throw new XaiError("BAD_REQUEST", "Text is required.", 400);
  if (input.fromLanguage === input.toLanguage) {
    throw new XaiError("BAD_REQUEST", "Source and target language are the same.", 400);
  }
  const system = [
    "You are TIJAR's translation engine for African market traders.",
    "Translate the user message accurately and naturally.",
    "Preserve numbers, currency (₦), product names, and proper nouns when appropriate.",
    "Return ONLY the translation — no quotes, labels, or explanations.",
  ].join(" ");
  const user = `Translate from ${input.fromLanguage} to ${input.toLanguage}:\n\n${text.slice(0, 2000)}`;
  const out = await xaiChat({ system, user, temperature: 0.2, maxTokens: 1200 }, config);
  return out.replace(/^["']|["']$/g, "").trim();
}

async function dataUrlFromImagePayload(json: {
  data?: Array<{ b64_json?: string; url?: string }>;
}): Promise<{ dataUrl: string }> {
  const row = json.data?.[0];
  if (row?.b64_json) return { dataUrl: `data:image/png;base64,${row.b64_json}` };
  if (row?.url) {
    const img = await fetch(row.url);
    if (!img.ok) throw new XaiError("PROVIDER_ERROR", "Could not download the flyer.", 502);
    const buf = Buffer.from(await img.arrayBuffer());
    return { dataUrl: `data:image/png;base64,${buf.toString("base64")}` };
  }
  throw new XaiError("PROVIDER_ERROR", "Grok returned no image.", 502);
}

export async function grokGenerateImage(input: {
  prompt: string;
  aspectRatio?: string;
  imageDataUrl?: string;
}): Promise<{ dataUrl: string }> {
  if (input.imageDataUrl) {
    return grokEditImage({ prompt: input.prompt, imageDataUrl: input.imageDataUrl, aspectRatio: input.aspectRatio });
  }
  const res = await xaiFetch("/images/generations", {
    method: "POST",
    body: JSON.stringify({
      model: "grok-imagine-image-2.0",
      prompt: input.prompt,
      n: 1,
      aspect_ratio: input.aspectRatio ?? "3:4",
      response_format: "b64_json",
    }),
  }, 120_000);
  if (!res.ok) throw await mapHttpError(res);
  return dataUrlFromImagePayload((await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> });
}

export async function grokEditImage(input: {
  prompt: string;
  imageDataUrl: string;
  aspectRatio?: string;
}): Promise<{ dataUrl: string }> {
  const res = await xaiFetch(
    "/images/edits",
    {
      method: "POST",
      body: JSON.stringify({
        model: "grok-imagine-image-2.0",
        prompt: input.prompt,
        image: { url: input.imageDataUrl, type: "image_url" },
        aspect_ratio: input.aspectRatio ?? "3:4",
        response_format: "b64_json",
      }),
    },
    120_000,
  );
  if (!res.ok) throw await mapHttpError(res);
  return dataUrlFromImagePayload((await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> });
}

export async function grokStartVideo(input: {
  prompt: string;
  imageDataUrl?: string;
  durationSec: number;
  voiceId?: string;
}): Promise<{ requestId: string }> {
  const duration = Math.min(15, Math.max(5, Math.round(input.durationSec)));
  const body: Record<string, unknown> = {
    model: "grok-imagine-video-1.5",
    prompt: input.prompt,
    duration,
    aspect_ratio: "9:16",
  };
  if (input.imageDataUrl) {
    body.image = { url: input.imageDataUrl };
  }
  if (input.voiceId) {
    body.reference_audios = [{ voice_id: input.voiceId }];
  }
  let res = await xaiFetch("/videos/generations", { method: "POST", body: JSON.stringify(body) }, 120_000);
  if (!res.ok && (res.status === 400 || res.status === 404)) {
    const firstBody = await res.clone().text();
    if (!/incorrect api key/i.test(firstBody)) {
      const lite: Record<string, unknown> = {
        model: "grok-imagine-video-1.5-lite",
        prompt: input.prompt,
        duration,
        aspect_ratio: "9:16",
      };
      if (input.imageDataUrl) lite.image = { url: input.imageDataUrl };
      res = await xaiFetch("/videos/generations", { method: "POST", body: JSON.stringify(lite) }, 120_000);
    }
  }
  if (!res.ok) throw await mapHttpError(res);
  const json = (await res.json()) as { request_id?: string; id?: string };
  const requestId = json.request_id || json.id;
  if (!requestId) throw new XaiError("PROVIDER_ERROR", "Grok did not start the video.", 502);
  return { requestId };
}

export async function grokPollVideo(requestId: string): Promise<{
  status: "pending" | "done" | "failed";
  url?: string;
  error?: string;
}> {
  const id = requestId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 128);
  if (!id) throw new XaiError("BAD_REQUEST", "Missing video id.", 400);
  const res = await xaiFetch(`/videos/${id}`, { method: "GET" }, 30_000);
  if (!res.ok) throw await mapHttpError(res);
  const json = (await res.json()) as {
    status?: string;
    video?: { url?: string };
    url?: string;
    error?: { message?: string };
  };
  const status = (json.status ?? "pending").toLowerCase();
  if (status === "done" || status === "succeeded" || status === "completed") {
    const url = json.video?.url || json.url;
    if (!url) return { status: "failed", error: "Video finished with no file." };
    return { status: "done", url };
  }
  if (status === "failed" || status === "expired" || status === "error") {
    return { status: "failed", error: json.error?.message || "Grok could not finish the video." };
  }
  return { status: "pending" };
}

export async function grokDownloadVideo(url: string): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  if (!/^https:\/\//i.test(url) || url.length > 2000) {
    throw new XaiError("BAD_REQUEST", "Invalid video URL.", 400);
  }
  const host = new URL(url).hostname;
  if (!host.endsWith("x.ai") && !host.endsWith("x.ai.com") && !host.includes("x.ai")) {
    throw new XaiError("BAD_REQUEST", "Unexpected video host.", 400);
  }
  const res = await fetch(url);
  if (!res.ok) throw new XaiError("PROVIDER_ERROR", "Could not download the video.", 502);
  return {
    bytes: await res.arrayBuffer(),
    contentType: res.headers.get("content-type") || "video/mp4",
  };
}
