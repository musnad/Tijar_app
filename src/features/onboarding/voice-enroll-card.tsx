"use client";

import { Check, Mic, Square, Volume2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { startAudioRecording } from "@/features/translate/use-speech";
import { speakText } from "@/features/translate/use-speech";
import { aiFetch } from "@/lib/ai/client-fetch";
import { VOICE_ENROLL_MAX_DURATION_MS } from "@/lib/ai/audio-guard";
import { OPENAI_TTS_VOICES, type OpenAiTtsVoice } from "@/lib/openai/voices";
import { VOICE_ENROLL_SCRIPT, writePersonalVoicePrefs } from "@/lib/voice/personal-voice";
import { cn } from "@/lib/utils";
import { saveVoiceProfile, uploadVoiceSample } from "@/services/voice-sample-service";

type Props = {
  profileId: string;
  lang: string;
  onDone: (result: { preferredVoice: OpenAiTtsVoice; customVoiceId: string | null }) => void;
  onSkip: () => void;
};

export function VoiceEnrollCard({ profileId, lang, onDone, onSkip }: Props) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hasSample, setHasSample] = useState(false);
  const [consent, setConsent] = useState(false);
  const [preferred, setPreferred] = useState<OpenAiTtsVoice>("nova");
  const [customVoiceId, setCustomVoiceId] = useState<string | null>(null);
  const stopRef = useRef<(() => Promise<Blob>) | null>(null);
  const startedAt = useRef<number>(0);

  async function startRec() {
    if (!consent) {
      toast.error("Tick the box to allow TIJAR to create a synthetic voice from your recording.");
      return;
    }
    try {
      const session = await startAudioRecording(VOICE_ENROLL_MAX_DURATION_MS);
      stopRef.current = session.stop;
      startedAt.current = Date.now();
      setRecording(true);
      toast.message("Speak clearly for about 12 seconds…");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open microphone.");
    }
  }

  async function stopRec() {
    const stopper = stopRef.current;
    stopRef.current = null;
    setRecording(false);
    if (!stopper) return;
    setBusy(true);
    try {
      const blob = await stopper();
      const durationMs = Date.now() - startedAt.current;
      const uploaded = await uploadVoiceSample(profileId, blob);
      if (uploaded.error || !uploaded.path) {
        toast.error(uploaded.error ?? "Upload failed");
        setBusy(false);
        return;
      }

      let clonedId: string | null = null;
      try {
        const form = new FormData();
        form.append("audio", blob, "sample.webm");
        form.append("name", "TIJAR shopkeeper");
        form.append("consent", "1");
        form.append("durationMs", String(durationMs));
        const res = await aiFetch("/api/voice-enroll", {
          method: "POST",
          body: form,
        });
        const body = (await res.json().catch(() => null)) as {
          voiceId?: string | null;
          message?: string;
          error?: { message?: string };
        } | null;
        if (res.status === 401) {
          toast.error("Sign in again, then save your voice.");
        } else if (res.ok && body?.voiceId) {
          clonedId = body.voiceId;
          setCustomVoiceId(body.voiceId);
          writePersonalVoicePrefs({ customVoiceId: body.voiceId });
          toast.success("Your personal voice is ready.");
        } else if (body?.error?.message) {
          toast.error(body.error.message);
        } else if (body?.message) {
          toast.message(body.message);
        }
      } catch {
        /* OpenAI preferred voice still works */
      }

      writePersonalVoicePrefs({
        voiceSamplePath: uploaded.path,
        preferredTtsVoice: preferred,
        customVoiceId: clonedId,
      });
      await saveVoiceProfile(profileId, {
        voiceSamplePath: uploaded.path,
        preferredTtsVoice: preferred,
      });
      setHasSample(true);
      if (!clonedId) {
        toast.success("Voice saved. Pick how TIJAR should sound, then continue.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save voice.");
    } finally {
      setBusy(false);
    }
  }

  async function previewVoice(v: OpenAiTtsVoice) {
    setPreferred(v);
    writePersonalVoicePrefs({ preferredTtsVoice: v });
    await speakText("Hello — this is how TIJAR will speak with you.", lang, { voice: v });
  }

  async function finish() {
    setBusy(true);
    await saveVoiceProfile(profileId, {
      preferredTtsVoice: preferred,
    });
    writePersonalVoicePrefs({ preferredTtsVoice: preferred, customVoiceId });
    setBusy(false);
    onDone({ preferredVoice: preferred, customVoiceId });
  }

  return (
    <section className="mt-4 rounded-3xl border border-border bg-card p-5 shadow-sm">
      <h2 className="font-extrabold">Save your voice</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Record a short sample (8–20 seconds). If you consent, TIJAR can send that recording to our
        voice partner to create a synthetic copy of your voice for speak-back in the app. We do not
        show the recording in logs. You can skip and use a stock voice instead.
      </p>

      <label className="mt-4 flex items-start gap-3 rounded-2xl border border-border bg-muted/40 p-3 text-sm">
        <input
          type="checkbox"
          className="mt-1 size-4"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>
          I agree that TIJAR may use this recording to create a synthetic voice for my account only.
        </span>
      </label>

      <div className="mt-4 rounded-2xl bg-muted/60 p-3 text-sm leading-relaxed">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Please say</p>
        <p className="mt-1 font-medium">{VOICE_ENROLL_SCRIPT}</p>
      </div>

      <div className="mt-5 flex flex-col items-center">
        <button
          type="button"
          disabled={busy || (!consent && !recording)}
          onClick={() => (recording ? void stopRec() : void startRec())}
          className={cn(
            "flex size-20 items-center justify-center rounded-full text-primary-foreground shadow-lg active:scale-95 disabled:opacity-50",
            recording ? "bg-destructive" : "bg-teal-700",
          )}
        >
          {recording ? <Square className="size-7" /> : <Mic className="size-8" />}
        </button>
        <p className="mt-3 text-sm font-semibold">
          {recording ? "Recording… tap to stop" : hasSample ? "Sample saved" : "Tap to record"}
        </p>
      </div>

      {hasSample && (
        <div className="mt-5 space-y-3 border-t border-border pt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Choose a TIJAR speak voice
          </p>
          <div className="flex flex-wrap gap-2">
            {OPENAI_TTS_VOICES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => void previewVoice(v)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-bold capitalize",
                  preferred === v
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background",
                )}
              >
                <Volume2 className="mr-1 inline size-3.5" />
                {v}
              </button>
            ))}
          </div>
          <Button
            type="button"
            className="min-h-12 w-full rounded-2xl font-bold"
            disabled={busy}
            onClick={() => void finish()}
          >
            <Check className="mr-1.5 size-4" /> Continue with my voice
          </Button>
        </div>
      )}

      <button
        type="button"
        className="mt-4 w-full text-center text-sm font-semibold text-muted-foreground underline-offset-2 hover:underline"
        onClick={onSkip}
      >
        Skip for now
      </button>
    </section>
  );
}
