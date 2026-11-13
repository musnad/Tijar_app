/** Server-side voice enrolment checks. Never log the bytes. */

export const VOICE_ENROLL_MAX_BYTES = 3 * 1024 * 1024;
export const VOICE_ENROLL_MIN_BYTES = 8_000;
export const VOICE_ENROLL_MAX_DURATION_MS = 20_000;
export const VOICE_ENROLL_MIN_DURATION_MS = 8_000;

const ALLOWED_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/ogg",
  "audio/x-m4a",
  "audio/m4a",
  "audio/aac",
]);

export type AudioGuardOk = { ok: true; mime: string };
export type AudioGuardFail = { ok: false; code: string; message: string; status: number };

function header(bytes: Uint8Array, ascii: string, offset = 0): boolean {
  if (bytes.length < offset + ascii.length) return false;
  for (let i = 0; i < ascii.length; i += 1) {
    if (bytes[offset + i] !== ascii.charCodeAt(i)) return false;
  }
  return true;
}

export function sniffAudioSignature(bytes: Uint8Array): string | null {
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return "audio/webm";
  }
  if (header(bytes, "OggS")) return "audio/ogg";
  if (header(bytes, "RIFF") && header(bytes, "WAVE", 8)) return "audio/wav";
  if (header(bytes, "ftyp", 4)) return "audio/mp4";
  if (bytes.length >= 3 && bytes[0] === 0xff && (bytes[1] === 0xfb || bytes[1] === 0xf3 || bytes[1] === 0xf2)) {
    return "audio/mpeg";
  }
  if (header(bytes, "ID3")) return "audio/mpeg";
  return null;
}

export function isAllowedEnrollType(type: string): boolean {
  const base = type.split(";")[0]!.trim().toLowerCase();
  return ALLOWED_TYPES.has(base);
}

export async function guardVoiceEnrollmentAudio(
  audio: Blob,
  durationMs?: number | null,
): Promise<AudioGuardOk | AudioGuardFail> {
  if (audio.size < VOICE_ENROLL_MIN_BYTES) {
    return {
      ok: false,
      status: 400,
      code: "AUDIO_TOO_SHORT",
      message: "Record at least 8 seconds of clear speech.",
    };
  }
  if (audio.size > VOICE_ENROLL_MAX_BYTES) {
    return {
      ok: false,
      status: 400,
      code: "AUDIO_TOO_LARGE",
      message: "Recording is too large (max 3 MB).",
    };
  }
  const declared = (audio.type || "").split(";")[0]!.trim().toLowerCase();
  if (declared && !isAllowedEnrollType(declared)) {
    return { ok: false, status: 400, code: "AUDIO_UNSUPPORTED", message: "Use WebM, MP4, WAV, OGG, or MP3." };
  }
  const buf = new Uint8Array(await audio.slice(0, 16).arrayBuffer());
  const sniffed = sniffAudioSignature(buf);
  if (!sniffed) {
    return { ok: false, status: 400, code: "AUDIO_UNSUPPORTED", message: "That file is not a recognised audio recording." };
  }
  if (typeof durationMs === "number") {
    if (durationMs < VOICE_ENROLL_MIN_DURATION_MS) {
      return { ok: false, status: 400, code: "AUDIO_TOO_SHORT", message: "Record at least 8 seconds of clear speech." };
    }
    if (durationMs > VOICE_ENROLL_MAX_DURATION_MS) {
      return { ok: false, status: 400, code: "AUDIO_TOO_LONG", message: "Keep the sample under 20 seconds." };
    }
  }
  return { ok: true, mime: sniffed };
}
