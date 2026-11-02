"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { bcp47For, isTijarLanguage } from "@/lib/translation/languages";
import { isOpenAiLanguage } from "@/lib/openai/languages";

/**
 * Languages the server can speak / hear via ElevenLabs / OpenAI TTS and
 * Whisper STT. Browser Web Speech is used when the server call fails.
 */
export function serverSpeechLanguage(languageName: string): boolean {
  return isTijarLanguage(languageName) || isOpenAiLanguage(languageName);
}

/** Fallback chain when a device lacks the exact locale (common on Android). */
export function speechLocaleCandidates(languageName: string): string[] {
  const primary = bcp47For(languageName);
  const base = primary.split("-")[0] ?? primary;
  const candidates = [primary, base, "en-NG", "en-GB", "en-US", "en"].filter(
    (v, i, arr) => v && arr.indexOf(v) === i,
  );
  return candidates;
}

export function mapRecognitionError(error: string | undefined, isSecure: boolean): string {
  if (!isSecure) {
    return "Voice needs a secure page. Open Tijar with https:// (or localhost), then allow the microphone.";
  }
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone is blocked. Allow microphone permission for this site in your browser settings, then try again.";
    case "audio-capture":
      return "No microphone was found on this device. You can type instead.";
    case "no-speech":
      return "I did not hear anything. Tap the microphone, speak clearly, then stop.";
    case "network":
      return "Voice service needs internet on this phone. Check your connection, or type instead.";
    case "language-not-supported":
      return "This phone does not support that voice language yet. English voice or typing will work.";
    case "aborted":
      return "Listening was stopped. Tap the microphone when you are ready.";
    default:
      return "Could not hear you clearly. Please try again or type.";
  }
}

type RecognitionResultEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

type RecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives?: number;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  onstart?: (() => void) | null;
};

function getRecognitionCtor(): (new () => RecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => RecognitionLike;
    webkitSpeechRecognition?: new () => RecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function recognitionSupported(): boolean {
  return getRecognitionCtor() !== null;
}

/** Score a system voice for a target BCP-47 tag (higher = better). */
export function scoreVoiceForLocale(voice: SpeechSynthesisVoice, locale: string): number {
  const want = locale.toLowerCase();
  const wantBase = want.split("-")[0] ?? want;
  const have = (voice.lang || "").toLowerCase();
  const haveBase = have.split("-")[0] ?? have;
  let score = 0;
  if (have === want) score += 100;
  else if (haveBase === wantBase) score += 60;
  else if (have.startsWith(wantBase)) score += 40;
  else return -1;
  if (voice.localService) score += 15;
  if (/neural|natural|premium|enhanced/i.test(voice.name)) score += 10;
  if (/google|microsoft|apple|samsung/i.test(voice.name)) score += 5;
  // Prefer Nigerian / African English when asking for en-NG / Pidgin
  if (want.startsWith("en") && /ng|nigeria|africa/i.test(`${have} ${voice.name}`)) score += 20;
  return score;
}

export function pickBestVoice(languageName: string, voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  const locales = speechLocaleCandidates(languageName);
  const primary = bcp47For(languageName);
  const primaryBase = primary.split("-")[0] ?? primary;
  // Prefer same-language voices first; only fall back to English if none exist.
  const preferred = locales.filter((l) => l === primary || l === primaryBase || l.startsWith(`${primaryBase}-`));
  const fallbacks = locales.filter((l) => !preferred.includes(l));

  const bestIn = (list: string[]): { voice: SpeechSynthesisVoice | null; score: number } => {
    let best: SpeechSynthesisVoice | null = null;
    let bestScore = -1;
    for (const locale of list) {
      for (const voice of voices) {
        const score = scoreVoiceForLocale(voice, locale);
        if (score > bestScore) {
          bestScore = score;
          best = voice;
        }
      }
      if (bestScore >= 100) break;
    }
    return { voice: best, score: bestScore };
  };

  const first = bestIn(preferred);
  if (first.voice && first.score > 0) return first.voice;
  return bestIn(fallbacks).voice;
}

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return Promise.resolve([]);
  }
  const existing = window.speechSynthesis.getVoices();
  if (existing.length > 0) return Promise.resolve(existing);

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.speechSynthesis.onvoiceschanged = null;
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.onvoiceschanged = finish;
    // Some browsers never fire the event — don't hang forever.
    window.setTimeout(finish, 400);
  });
}

/** Keep the last utterance referenced so Chrome does not GC it mid-speech. */
let activeUtterance: SpeechSynthesisUtterance | null = null;
let activeAudio: HTMLAudioElement | null = null;
let activeAudioUrl: string | null = null;
const speakingListeners = new Set<(speaking: boolean) => void>();

function notifySpeaking(speaking: boolean) {
  for (const listener of speakingListeners) listener(speaking);
}

function stopServerAudio(): void {
  if (activeAudio) {
    try {
      activeAudio.pause();
      activeAudio.removeAttribute("src");
      activeAudio.load();
    } catch {
      /* ignore */
    }
    activeAudio = null;
  }
  if (activeAudioUrl) {
    URL.revokeObjectURL(activeAudioUrl);
    activeAudioUrl = null;
  }
}

export function stopSpeaking(): void {
  stopServerAudio();
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    notifySpeaking(false);
    return;
  }
  window.speechSynthesis.cancel();
  activeUtterance = null;
  notifySpeaking(false);
}

export function isSpeakingNow(): boolean {
  if (activeAudio && !activeAudio.paused && !activeAudio.ended) return true;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  return window.speechSynthesis.speaking || window.speechSynthesis.pending;
}

/** Play server TTS (ElevenLabs clone / OpenAI) via /api/speak. */
async function speakViaServer(
  text: string,
  languageName: string,
  rate?: number,
  voiceOpts?: { voice?: string | null; customVoiceId?: string | null },
): Promise<boolean> {
  if (typeof window === "undefined" || !serverSpeechLanguage(languageName)) return false;
  let res: Response;
  try {
    res = await fetch("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: text.slice(0, 1000),
        language: languageName,
        speakingRate: rate ?? 1,
        ...(voiceOpts?.voice ? { voice: voiceOpts.voice } : {}),
        ...(voiceOpts?.customVoiceId ? { customVoiceId: voiceOpts.customVoiceId } : {}),
      }),
    });
  } catch {
    return false;
  }
  const contentType = res.headers.get("content-type") || "";
  if (!res.ok || contentType.includes("application/json")) return false;

  stopServerAudio();
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }

  const blob = await res.blob();
  if (!blob.size) return false;
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  activeAudio = audio;
  activeAudioUrl = url;
  notifySpeaking(true);

  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      if (activeAudio === audio) activeAudio = null;
      if (activeAudioUrl === url) {
        URL.revokeObjectURL(url);
        activeAudioUrl = null;
      }
      notifySpeaking(false);
      resolve(ok);
    };
    audio.onended = () => finish(true);
    audio.onerror = () => finish(false);
    void audio.play().catch(() => finish(false));
  });
}

export type SpeakOptions = {
  /** 0.1–2, default ~0.95 for clear shop-owner pace */
  rate?: number;
  pitch?: number;
  volume?: number;
  /** OpenAI stock voice override */
  voice?: string;
  /** Personal clone id (ElevenLabs) */
  customVoiceId?: string;
};

/**
 * Speak text aloud. Prefers server TTS (personal ElevenLabs clone → OpenAI TTS),
 * then falls back to the device speech engine.
 */
export async function speakText(
  text: string,
  languageName: string,
  options: SpeakOptions = {},
): Promise<boolean> {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return false;

  stopSpeaking();

  if (serverSpeechLanguage(languageName)) {
    const serverRate =
      options.rate !== undefined ? Math.min(2, Math.max(0.5, options.rate)) : 1;
    // Lazy import avoids circular deps with personal-voice helpers.
    let prefs: { preferredTtsVoice: string | null; customVoiceId: string | null } = {
      preferredTtsVoice: null,
      customVoiceId: null,
    };
    try {
      const mod = await import("@/lib/voice/personal-voice");
      prefs = mod.readPersonalVoicePrefs();
    } catch {
      /* ignore */
    }
    const ok = await speakViaServer(cleaned, languageName, serverRate, {
      voice: options.voice ?? prefs.preferredTtsVoice,
      customVoiceId: options.customVoiceId ?? prefs.customVoiceId,
    });
    if (ok) return true;
  }

  if (!speechSupported()) return false;

  const synth = window.speechSynthesis;
  try {
    synth.cancel();
    synth.resume();
  } catch {
    /* ignore */
  }

  const voices = await loadVoices();
  const locale = bcp47For(languageName);
  const voice = pickBestVoice(languageName, voices);

  const utter = new SpeechSynthesisUtterance(cleaned);
  utter.lang = voice?.lang || locale;
  if (voice) utter.voice = voice;
  utter.rate = options.rate ?? 0.95;
  utter.pitch = options.pitch ?? 1;
  utter.volume = options.volume ?? 1;

  activeUtterance = utter;
  notifySpeaking(true);

  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      if (activeUtterance === utter) activeUtterance = null;
      notifySpeaking(false);
      resolve(ok);
    };
    utter.onend = () => finish(true);
    utter.onerror = () => finish(false);

    try {
      synth.speak(utter);
      if (synth.paused) synth.resume();
      window.setTimeout(() => {
        if (synth.paused) synth.resume();
      }, 50);
    } catch {
      finish(false);
    }
  });
}

const MAX_RECORD_MS = 60_000;
/** Auto-stop for server STT recording when the user does not tap Stop. */
const SERVER_AUTO_STOP_MS = 15_000;

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  // Prefer compact audio formats (mp4/m4a, ogg) before webm when the browser allows.
  for (const type of [
    "audio/mp4",
    "audio/aac",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/webm;codecs=opus",
    "audio/webm",
  ]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return undefined;
}

function canRecordAudio(): boolean {
  return (
    typeof window !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"
  );
}

/**
 * Push-to-talk MediaRecorder. Caller starts; returns a stop() that resolves to the blob.
 */
export async function startAudioRecording(): Promise<{
  stop: () => Promise<Blob>;
  cancel: () => void;
}> {
  if (!canRecordAudio()) {
    throw new Error("Voice recording is not supported on this device. Please type instead.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  const mime = pickRecorderMime();
  const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  const chunks: Blob[] = [];
  let settled = false;
  let settle: ((blob: Blob) => void) | null = null;
  let fail: ((err: Error) => void) | null = null;
  const done = new Promise<Blob>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });

  const finishOk = (blob: Blob) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(maxTimer);
    stream.getTracks().forEach((t) => t.stop());
    settle?.(blob);
  };
  const finishErr = (err: Error) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(maxTimer);
    stream.getTracks().forEach((t) => t.stop());
    fail?.(err);
  };

  const maxTimer = window.setTimeout(() => {
    try {
      if (recorder.state === "recording") {
        try {
          recorder.requestData();
        } catch {
          /* ignore */
        }
        recorder.stop();
      }
    } catch {
      /* ignore */
    }
  }, MAX_RECORD_MS);

  recorder.ondataavailable = (e) => {
    if (e.data?.size) chunks.push(e.data);
  };
  recorder.onerror = () => {
    finishErr(new Error("Recording failed. Please try again."));
  };
  recorder.onstop = () => {
    const type = recorder.mimeType || mime || "audio/webm";
    finishOk(new Blob(chunks, { type }));
  };

  // Timeslice so Safari/Chrome flush audio chunks before stop.
  try {
    recorder.start(250);
  } catch {
    recorder.start();
  }

  return {
    stop: async () => {
      if (recorder.state === "recording") {
        try {
          recorder.requestData();
        } catch {
          /* ignore */
        }
        recorder.stop();
      } else if (recorder.state === "inactive" && !settled) {
        const type = recorder.mimeType || mime || "audio/webm";
        finishOk(new Blob(chunks, { type }));
      }
      return done;
    },
    cancel: () => {
      try {
        if (recorder.state === "recording") recorder.stop();
      } catch {
        /* ignore */
      }
      stream.getTracks().forEach((t) => t.stop());
      window.clearTimeout(maxTimer);
      if (!settled) {
        settled = true;
        fail?.(Object.assign(new Error(mapRecognitionError("aborted", true)), { code: "aborted" }));
      }
    },
  };
}

/** Upload a recording to Whisper STT / speech-translate via our server. */
export async function transcribeAudioClient(input: {
  audio: Blob;
  language: string;
  toLanguage?: string | undefined;
}): Promise<
  | { ok: true; transcript: string; translatedText: string | null; language: string; mode: string }
  | { ok: false; code: string; message: string }
> {
  try {
    const form = new FormData();
    const ext = input.audio.type.includes("mp4") ? "m4a" : input.audio.type.includes("ogg") ? "ogg" : "webm";
    form.append("audio", input.audio, `voice.${ext}`);
    form.append("language", input.language);
    if (input.toLanguage) form.append("toLanguage", input.toLanguage);

    const res = await fetch("/api/translate-speech", { method: "POST", body: form });
    const body = (await res.json().catch(() => null)) as
      | {
          transcript?: string;
          translatedText?: string | null;
          language?: string;
          mode?: string;
          error?: { code: string; message: string };
        }
      | null;

    if (!res.ok || !body?.transcript) {
      return {
        ok: false,
        code: body?.error?.code ?? "PROVIDER_ERROR",
        message: body?.error?.message ?? "Could not hear you clearly. Please try again.",
      };
    }
    return {
      ok: true,
      transcript: body.transcript,
      translatedText: body.translatedText ?? null,
      language: body.language ?? input.language,
      mode: body.mode ?? "stt",
    };
  } catch {
    return { ok: false, code: "NETWORK", message: "Could not reach speech service. Check your connection." };
  }
}

/**
 * Hook: speaking state for Hear-it buttons and auto-replies.
 */
export function useSpeechPlayback() {
  const [speaking, setSpeaking] = useState(false);
  const [supported] = useState(() => speechSupported());

  useEffect(() => {
    speakingListeners.add(setSpeaking);
    setSpeaking(isSpeakingNow());
    return () => {
      speakingListeners.delete(setSpeaking);
    };
  }, []);

  const speak = useCallback(async (text: string, languageName: string, options?: SpeakOptions) => {
    return speakText(text, languageName, options);
  }, []);

  const stop = useCallback(() => {
    stopSpeaking();
  }, []);

  return { speak, stop, speaking, supported };
}

function listenOnce(
  locale: string,
  isSecure: boolean,
  onInstance: (rec: RecognitionLike | null) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      reject(new Error("Voice input is not supported on this device or browser. Please type instead."));
      return;
    }
    const rec = new Ctor();
    let settled = false;
    onInstance(rec);
    rec.lang = locale;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    let finalTranscript = "";
    // Safety: some browsers never fire onend after no-speech.
    const watchdog = window.setTimeout(() => {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }, 12_000);

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(watchdog);
      onInstance(null);
      fn();
    };

    rec.onresult = (e) => {
      const transcript = Array.from({ length: e.results.length }, (_, i) => e.results[i]?.[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (transcript) finalTranscript = transcript;
    };

    rec.onerror = (e) => {
      finish(() => {
        if (e?.error === "aborted") {
          reject(Object.assign(new Error(mapRecognitionError("aborted", isSecure)), { code: "aborted" }));
          return;
        }
        // no-speech sometimes arrives as an error before onend — treat as empty.
        if (e?.error === "no-speech") {
          reject(Object.assign(new Error(mapRecognitionError("no-speech", isSecure)), { code: "no-speech" }));
          return;
        }
        const err = new Error(mapRecognitionError(e?.error, isSecure));
        (err as Error & { code?: string }).code = e?.error ?? "unknown";
        reject(err);
      });
    };
    rec.onend = () => {
      finish(() => {
        const text = finalTranscript.trim();
        if (text) resolve(text);
        else reject(Object.assign(new Error(mapRecognitionError("no-speech", isSecure)), { code: "no-speech" }));
      });
    };
    try {
      stopSpeaking();
      rec.start();
    } catch {
      finish(() => {
        reject(new Error("Microphone is busy. Wait a second and try again."));
      });
    }
  });
}

/**
 * Explicit push-to-talk recognition. Never continuous/background.
 *
 * Order (most reliable UX first):
 * 1) Browser Web Speech when available (auto end-of-utterance — best for Learn A/B/C)
 * 2) MediaRecorder → Whisper STT for African languages when the browser fails
 *    or has no speech recognition
 */
export function useSpeechRecognition() {
  const [listening, setListening] = useState(false);
  const [supported] = useState(() => recognitionSupported() || canRecordAudio());
  const activeRef = useRef(false);
  const recRef = useRef<RecognitionLike | null>(null);
  const recordStopRef = useRef<(() => Promise<Blob>) | null>(null);
  const recordCancelRef = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    // MediaRecorder: stop means "finish and transcribe", not abort.
    const stopper = recordStopRef.current;
    if (stopper) {
      recordStopRef.current = null;
      void stopper();
      return;
    }
    activeRef.current = false;
    setListening(false);
    try {
      recRef.current?.stop();
      recRef.current?.abort?.();
    } catch {
      /* ignore */
    }
    recRef.current = null;
    recordCancelRef.current?.();
    recordCancelRef.current = null;
  }, []);

  const listenBrowser = useCallback(async (languageName: string, isSecure: boolean): Promise<string> => {
    if (!getRecognitionCtor()) {
      throw Object.assign(new Error("Voice input is not supported on this device or browser. Please type instead."), {
        code: "language-not-supported",
      });
    }
    // Brief pause after canceling TTS — Chrome often drops the first listen otherwise.
    await new Promise((r) => window.setTimeout(r, 120));
    const candidates = speechLocaleCandidates(languageName);
    let lastError: Error | null = null;
    for (const locale of candidates) {
      if (!activeRef.current) {
        throw Object.assign(new Error(mapRecognitionError("aborted", isSecure)), { code: "aborted" });
      }
      try {
        return await listenOnce(locale, isSecure, (rec) => {
          recRef.current = rec;
        });
      } catch (err) {
        lastError = err instanceof Error ? err : new Error("Voice failed.");
        const code = (err as Error & { code?: string }).code;
        if (code === "aborted") throw lastError;
        // Retry next locale only for locale / network problems.
        if (code !== "language-not-supported" && code !== "network") break;
      }
    }
    throw lastError ?? new Error(mapRecognitionError(undefined, isSecure));
  }, []);

  const listenViaServer = useCallback(async (languageName: string, isSecure: boolean): Promise<string> => {
    if (!serverSpeechLanguage(languageName) || !canRecordAudio()) {
      throw Object.assign(new Error(mapRecognitionError("language-not-supported", isSecure)), {
        code: "language-not-supported",
      });
    }
    const session = await startAudioRecording();
    recordCancelRef.current = session.cancel;

    const blob = await new Promise<Blob>((resolve, reject) => {
      let settled = false;
      const finish = (p: Promise<Blob>) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(auto);
        recordStopRef.current = null;
        p.then(resolve, reject);
      };
      const auto = window.setTimeout(() => finish(session.stop()), SERVER_AUTO_STOP_MS);
      recordStopRef.current = async () => {
        const b = await session.stop();
        finish(Promise.resolve(b));
        return b;
      };
    });

    recordStopRef.current = null;
    recordCancelRef.current = null;

    if (!activeRef.current) {
      throw Object.assign(new Error(mapRecognitionError("aborted", isSecure)), { code: "aborted" });
    }
    if (blob.size < 800) {
      throw Object.assign(new Error(mapRecognitionError("no-speech", isSecure)), { code: "no-speech" });
    }

    const result = await transcribeAudioClient({ audio: blob, language: languageName });
    if (result.ok && result.transcript.trim()) return result.transcript.trim();
    throw Object.assign(new Error(result.ok === false ? result.message : mapRecognitionError("no-speech", isSecure)), {
      code: result.ok === false ? result.code : "no-speech",
    });
  }, []);

  const listen = useCallback(
    async (languageName: string): Promise<string> => {
      if (activeRef.current) {
        throw new Error("Already listening — speak now, or stop first.");
      }
      const isSecure = typeof window === "undefined" ? true : window.isSecureContext;
      if (!isSecure) {
        throw new Error(mapRecognitionError("not-allowed", false));
      }

      activeRef.current = true;
      setListening(true);
      stopSpeaking();

      try {
        const preferServerStt =
          serverSpeechLanguage(languageName) &&
          languageName !== "English" &&
          canRecordAudio();

        // African languages: MediaRecorder → server STT first (browser ASR is often missing).
        if (preferServerStt) {
          try {
            return await listenViaServer(languageName, isSecure);
          } catch (err) {
            const code = (err as Error & { code?: string }).code;
            if (code === "aborted" || code === "not-allowed" || code === "service-not-allowed") {
              throw err;
            }
            // Fall through to browser ASR if available.
          }
        }

        if (getRecognitionCtor()) {
          try {
            return await listenBrowser(languageName, isSecure);
          } catch (err) {
            const code = (err as Error & { code?: string }).code;
            if (code === "aborted" || code === "not-allowed" || code === "service-not-allowed") {
              throw err;
            }
            if (!serverSpeechLanguage(languageName) || !canRecordAudio()) throw err;
          }
        }

        // English / fallback: server STT via MediaRecorder (tap Stop or wait ~8s).
        if (serverSpeechLanguage(languageName) && canRecordAudio()) {
          return await listenViaServer(languageName, isSecure);
        }

        throw new Error("Voice input is not supported on this device or browser. Please type instead.");
      } finally {
        activeRef.current = false;
        recRef.current = null;
        recordStopRef.current = null;
        recordCancelRef.current = null;
        setListening(false);
      }
    },
    [listenBrowser, listenViaServer],
  );

  return { listen, stop, listening, supported };
}
