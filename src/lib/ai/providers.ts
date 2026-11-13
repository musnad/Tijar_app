import { isElevenLabsConfigured } from "@/lib/elevenlabs/client";
import { isOpenAiConfigured } from "@/lib/openai/client";
import { isTijarTranslateConfigured } from "@/lib/translation/tijar-worker";
import { isXaiConfigured } from "@/lib/xai/client";
import type { AiProvider, AiServiceSlug } from "@/lib/ai/services";

/**
 * Choose a provider. Phase 3: translate may use the optional TIJAR worker (`vllm` slot).
 * No GPU is started from this repo — only an HTTPS worker URL.
 */
export function selectAiProvider(service: AiServiceSlug): AiProvider {
  switch (service) {
    case "translate":
    case "translate_batch":
      if (isTijarTranslateConfigured()) return "vllm";
    // fall through to Grok / OpenAI when the worker URL is unset
    case "assistant":
    case "listing":
    case "sale":
    case "caption":
    case "report":
      if (isXaiConfigured()) return "xai";
      if (isOpenAiConfigured()) return "openai";
      return "local";
    case "stt":
    case "translate_speech":
      if (isOpenAiConfigured()) return "openai";
      return "local";
    case "tts":
      if (isElevenLabsConfigured()) return "elevenlabs";
      if (isOpenAiConfigured()) return "openai";
      return "local";
    case "voice_enroll":
      if (isElevenLabsConfigured()) return "elevenlabs";
      return "local";
    case "graphics":
    case "flyer":
      if (isXaiConfigured()) return "xai";
      if (isOpenAiConfigured()) return "openai";
      return "local";
    case "video":
      if (isXaiConfigured()) return "xai";
      return "local";
    case "search_image":
      if (isOpenAiConfigured()) return "openai";
      return "local";
    default:
      return "local";
  }
}

export function providerModelHint(provider: AiProvider, service: AiServiceSlug): string {
  if (provider === "xai") return service === "video" ? "grok-video" : "grok";
  if (provider === "openai") {
    if (service === "stt" || service === "translate_speech") return "whisper-1";
    if (service === "tts") return "tts-1";
    if (service === "graphics" || service === "flyer") return "gpt-image";
    if (service === "search_image") return "gpt-4o-mini";
    return "gpt-4o-mini";
  }
  if (provider === "elevenlabs") return "eleven_multilingual";
  if (provider === "vllm") return "tijar-vllm";
  if (provider === "cache") return "cache";
  return "local";
}
