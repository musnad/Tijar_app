import { aiFetch } from "@/lib/ai/client-fetch";
import { aiClientHeaders } from "@/lib/ai/request-headers";
import { STUDIO_LANGUAGE_NAME } from "@/lib/marketing/draft-content";
import type { Locale } from "@/lib/i18n/types";

export type StudioStatus = { grok: boolean; tts: boolean; design?: boolean };

export async function fetchStudioStatus(): Promise<StudioStatus> {
  const res = await fetch("/api/studio/status");
  if (!res.ok) return { grok: false, tts: false, design: false };
  return (await res.json()) as StudioStatus;
}

export async function requestFlyer(input: {
  prompt: string;
  productName: string;
  businessName: string;
  style: string;
  locale: Locale;
  imageDataUrl?: string;
  priceLabel?: string;
}): Promise<{ dataUrl?: string; fallback: boolean; grok?: boolean; caption?: string; captionHa?: string; error?: string }> {
  const res = await aiFetch("/api/studio/flyer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, language: STUDIO_LANGUAGE_NAME[input.locale] }),
  });
  const json = (await res.json()) as {
    dataUrl?: string;
    fallback?: boolean;
    grok?: boolean;
    caption?: string;
    captionHa?: string;
    error?: { message?: string };
  };
  if (json.dataUrl) {
    return {
      dataUrl: json.dataUrl,
      fallback: false,
      grok: json.grok,
      caption: json.caption,
      captionHa: json.captionHa,
    };
  }
  return { fallback: true, grok: json.grok, caption: json.caption, captionHa: json.captionHa, error: json.error?.message };
}

export async function requestGrokVideo(input: {
  prompt: string;
  imageDataUrl?: string;
  durationSec: number;
  locale: Locale;
}): Promise<{ requestId?: string; fallback: boolean; error?: string }> {
  const idempotencyKey = crypto.randomUUID();
  const res = await aiFetch("/api/studio/video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    idempotencyKey,
    body: JSON.stringify({
      ...input,
      voiceId: "eve",
      language: STUDIO_LANGUAGE_NAME[input.locale],
    }),
  });
  const json = (await res.json()) as { requestId?: string; fallback?: boolean; error?: { message?: string } };
  if (json.requestId) return { requestId: json.requestId, fallback: false };
  return { fallback: true, error: json.error?.message };
}

export async function pollGrokVideo(requestId: string): Promise<{ status: string; error?: string }> {
  const res = await fetch(`/api/studio/video/${encodeURIComponent(requestId)}`, {
    headers: await aiClientHeaders(),
  });
  return (await res.json()) as { status: string; error?: string };
}

export async function downloadGrokVideo(requestId: string): Promise<Blob> {
  const res = await fetch(`/api/studio/video/${encodeURIComponent(requestId)}?download=1`, {
    headers: await aiClientHeaders(),
  });
  if (!res.ok) throw new Error("Could not download the Grok video.");
  return res.blob();
}

export async function speakAdvert(text: string, locale: Locale): Promise<Blob | null> {
  const res = await aiFetch("/api/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: text.slice(0, 400),
      language: STUDIO_LANGUAGE_NAME[locale],
      speakingRate: 1,
    }),
  });
  if (!res.ok) return null;
  const type = res.headers.get("content-type") || "audio/mpeg";
  if (!type.startsWith("audio/")) return null;
  return res.blob();
}
