"use client";

import { Mic, Square } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/context";
import { isTijarLanguage } from "@/lib/translation/languages";
import { startAudioRecording, transcribeAudioClient } from "./use-speech";

const MAX_SECONDS = 60;

type VoiceTranslateProps = {
  onUseTranscript: (text: string) => void;
  /** Spoken language display name. */
  language?: string;
  /** Optional: translate speech into this language before offering the text. */
  toLanguage?: string;
};

/**
 * Explicit push-to-talk recording → Whisper STT
 * (or speech-translate when toLanguage is set). Transcript is always
 * shown for review before the user chooses to use it.
 */
export function VoiceTranslate({
  onUseTranscript,
  language = "English",
  toLanguage,
}: VoiceTranslateProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "recording"; seconds: number }
    | { kind: "processing" }
    | { kind: "done"; transcript: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const stopRef = useRef<(() => Promise<Blob>) | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function start() {
    if (!isTijarLanguage(language)) {
      setState({
        kind: "error",
        message: t("app.translator.voiceLanguageUnsupported"),
      });
      return;
    }
    try {
      const session = await startAudioRecording();
      stopRef.current = session.stop;
      cancelRef.current = session.cancel;
      let seconds = 0;
      setState({ kind: "recording", seconds });
      timerRef.current = setInterval(() => {
        seconds += 1;
        setState({ kind: "recording", seconds });
        if (seconds >= MAX_SECONDS) void stop();
      }, 1000);
    } catch {
      setState({ kind: "error", message: t("app.translator.micDenied") });
    }
  }

  async function stop() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const stopper = stopRef.current;
    stopRef.current = null;
    cancelRef.current = null;
    if (!stopper) return;
    setState({ kind: "processing" });
    try {
      const blob = await stopper();
      await upload(blob);
    } catch {
      setState({ kind: "error", message: t("app.translator.voiceProcessingFailed") });
    }
  }

  async function upload(blob: Blob) {
    if (blob.size > 5 * 1024 * 1024) {
      setState({ kind: "error", message: t("app.translator.recordingTooLarge") });
      return;
    }
    if (blob.size < 800) {
      setState({ kind: "error", message: t("app.translator.voiceProcessingFailed") });
      return;
    }
    const result = await transcribeAudioClient({
      audio: blob,
      language,
      toLanguage: toLanguage && toLanguage !== language ? toLanguage : undefined,
    });
    if (result.ok) {
      const text = (result.translatedText || result.transcript).trim();
      if (text) {
        setState({ kind: "done", transcript: text });
        return;
      }
    }
    setState({
      kind: "error",
      message: result.ok === false ? result.message : t("app.translator.voiceProcessingFailed"),
    });
  }

  return (
    <div className="rounded-xl bg-muted/60 p-3">
      <div className="flex items-center gap-2">
        {state.kind === "recording" ? (
          <Button type="button" size="sm" variant="destructive" className="min-h-10 rounded-xl" onClick={() => void stop()}>
            <Square className="mr-1 size-4" />{" "}
            {t("app.translator.stopWithSeconds").replace("{seconds}", String(state.seconds))}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-10 rounded-xl"
            onClick={() => void start()}
            disabled={state.kind === "processing"}
          >
            <Mic className="mr-1 size-4" />{" "}
            {state.kind === "processing" ? t("app.translator.processing") : t("app.translator.recordVoice")}
          </Button>
        )}
        <span className="text-xs text-muted-foreground">{t("app.translator.maxSixtyHint")}</span>
      </div>
      {state.kind === "done" && (
        <div className="mt-2 text-sm">
          <p className="font-semibold">{t("app.translator.transcriptLabel")}</p>
          <p className="mt-0.5">{state.transcript}</p>
          <Button
            type="button"
            size="sm"
            className="mt-2 min-h-9 rounded-lg text-xs"
            onClick={() => onUseTranscript(state.transcript)}
          >
            {t("app.translator.useThisText")}
          </Button>
        </div>
      )}
      {state.kind === "error" && <p className="mt-2 text-xs text-destructive">{state.message}</p>}
    </div>
  );
}
