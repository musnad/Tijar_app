import { isElevenLabsConfigured } from "@/lib/elevenlabs/client";

import type { AiGatewayError } from "@/lib/ai/gateway";

export function requireVoiceCloneProvider(configured = isElevenLabsConfigured()): AiGatewayError | null {
  if (configured) return null;
  return {
    ok: false,
    status: 503,
    code: "NOT_CONFIGURED",
    message: "Personal voice enrolment is not configured on this server.",
  };
}

export function evaluateCustomVoiceAccess(
  customVoiceId: unknown,
  owned: boolean,
): { ok: true; voiceId: string | null } | { ok: false; status: 403; code: "VOICE_FORBIDDEN"; message: string } {
  if (typeof customVoiceId !== "string" || !customVoiceId.trim()) {
    return { ok: true, voiceId: null };
  }
  if (!owned) {
    return {
      ok: false,
      status: 403,
      code: "VOICE_FORBIDDEN",
      message: "That voice does not belong to this account.",
    };
  }
  return { ok: true, voiceId: customVoiceId.trim() };
}
