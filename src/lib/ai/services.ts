/** Configurable AI service catalogue. Database `ai_services.credit_cost` is authoritative after SQL is applied. */

export const AI_PROVIDERS = ["xai", "openai", "elevenlabs", "vllm", "local", "cache"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const AI_SERVICE_SLUGS = [
  "translate",
  "translate_batch",
  "translate_speech",
  "stt",
  "tts",
  "assistant",
  "listing",
  "sale",
  "caption",
  "report",
  "graphics",
  "flyer",
  "video",
  "voice_enroll",
  "search_image",
] as const;

export type AiServiceSlug = (typeof AI_SERVICE_SLUGS)[number];

export type AiServiceConfig = {
  slug: AiServiceSlug;
  displayName: string;
  creditCost: number;
  rateLimitPerMin: number;
  timeoutMs: number;
  auth: "required";
  defaultProvider: AiProvider;
  /** Video start timeouts must not auto-refund (provider may have accepted). */
  refundOnTimeout: boolean;
};

export const DEFAULT_AI_SERVICES: Record<AiServiceSlug, AiServiceConfig> = {
  translate: { slug: "translate", displayName: "Translate", creditCost: 1, rateLimitPerMin: 40, timeoutMs: 30_000, auth: "required", defaultProvider: "xai", refundOnTimeout: true },
  translate_batch: { slug: "translate_batch", displayName: "Translate batch", creditCost: 2, rateLimitPerMin: 20, timeoutMs: 45_000, auth: "required", defaultProvider: "xai", refundOnTimeout: true },
  translate_speech: { slug: "translate_speech", displayName: "Speech translate", creditCost: 4, rateLimitPerMin: 20, timeoutMs: 60_000, auth: "required", defaultProvider: "openai", refundOnTimeout: true },
  stt: { slug: "stt", displayName: "Speech to text", creditCost: 3, rateLimitPerMin: 20, timeoutMs: 60_000, auth: "required", defaultProvider: "openai", refundOnTimeout: true },
  tts: { slug: "tts", displayName: "Text to speech", creditCost: 4, rateLimitPerMin: 30, timeoutMs: 45_000, auth: "required", defaultProvider: "openai", refundOnTimeout: true },
  assistant: { slug: "assistant", displayName: "Assistant", creditCost: 2, rateLimitPerMin: 30, timeoutMs: 45_000, auth: "required", defaultProvider: "xai", refundOnTimeout: true },
  listing: { slug: "listing", displayName: "Voice listing", creditCost: 2, rateLimitPerMin: 20, timeoutMs: 45_000, auth: "required", defaultProvider: "xai", refundOnTimeout: true },
  sale: { slug: "sale", displayName: "Voice sale", creditCost: 2, rateLimitPerMin: 20, timeoutMs: 45_000, auth: "required", defaultProvider: "xai", refundOnTimeout: true },
  caption: { slug: "caption", displayName: "Caption", creditCost: 2, rateLimitPerMin: 20, timeoutMs: 45_000, auth: "required", defaultProvider: "xai", refundOnTimeout: true },
  report: { slug: "report", displayName: "Business report", creditCost: 2, rateLimitPerMin: 12, timeoutMs: 45_000, auth: "required", defaultProvider: "xai", refundOnTimeout: true },
  graphics: { slug: "graphics", displayName: "Poster", creditCost: 25, rateLimitPerMin: 8, timeoutMs: 120_000, auth: "required", defaultProvider: "xai", refundOnTimeout: true },
  flyer: { slug: "flyer", displayName: "Flyer", creditCost: 25, rateLimitPerMin: 8, timeoutMs: 180_000, auth: "required", defaultProvider: "xai", refundOnTimeout: true },
  video: { slug: "video", displayName: "Video", creditCost: 200, rateLimitPerMin: 4, timeoutMs: 180_000, auth: "required", defaultProvider: "xai", refundOnTimeout: false },
  voice_enroll: { slug: "voice_enroll", displayName: "Voice enroll", creditCost: 10, rateLimitPerMin: 6, timeoutMs: 60_000, auth: "required", defaultProvider: "elevenlabs", refundOnTimeout: true },
  /** Metered and authenticated. Credit cost 0 until commercial price is approved (proposed: 2). */
  search_image: { slug: "search_image", displayName: "Search by photo", creditCost: 0, rateLimitPerMin: 12, timeoutMs: 45_000, auth: "required", defaultProvider: "openai", refundOnTimeout: true },
};

export const DEFAULT_AI_CREDIT_GRANT = 500;
export const AI_CREDIT_COST_MAX = 10_000;
export const PROPOSED_SEARCH_IMAGE_CREDIT_COST = 2;

export function isAiServiceSlug(value: string): value is AiServiceSlug {
  return (AI_SERVICE_SLUGS as readonly string[]).includes(value);
}

export function isTimeoutError(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code: string }).code === "TIMEOUT");
}
