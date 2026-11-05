"use client";

import { Mic } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { aiPostAudio } from "@/lib/ai/seller-ai-client";
import { startAudioRecording } from "@/features/translate/use-speech";
import { cn } from "@/lib/utils";

export function HoldToTalk({
  language,
  disabled,
  onTranscript,
  label,
  compact,
}: {
  language: string;
  disabled?: boolean;
  onTranscript: (text: string) => void;
  label: string;
  compact?: boolean;
}) {
  const [holding, setHolding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<{ stop: () => Promise<Blob>; cancel: () => void } | null>(null);

  async function startHold() {
    if (disabled || busy || holding) return;
    setError(null);
    try {
      const session = await startAudioRecording();
      sessionRef.current = session;
      setHolding(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microphone is blocked. Type instead.");
    }
  }

  async function endHold() {
    const session = sessionRef.current;
    sessionRef.current = null;
    setHolding(false);
    if (!session) return;
    setBusy(true);
    try {
      const blob = await session.stop();
      if (blob.size < 800) {
        setError("I did not hear anything. Hold the button and speak clearly.");
        return;
      }
      const { transcript } = await aiPostAudio("/api/ai/transcribe", blob, language);
      if (!transcript.trim()) {
        setError("I did not catch that. Try again or type.");
        return;
      }
      onTranscript(transcript.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not hear you. Type instead.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("space-y-2", compact && "space-y-0")}>
      <Button
        type="button"
        disabled={disabled || busy}
        aria-label={label}
        className={cn(
          "touch-none font-bold text-white",
          compact
            ? "size-11 min-h-11 shrink-0 rounded-xl px-0"
            : "min-h-16 w-full rounded-2xl text-base",
          holding ? "bg-[#00B86B]" : "bg-[#0A2540] hover:bg-[#0A2540]/90",
        )}
        onPointerDown={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
          void startHold();
        }}
        onPointerUp={() => void endHold()}
        onPointerCancel={() => {
          sessionRef.current?.cancel();
          sessionRef.current = null;
          setHolding(false);
        }}
      >
        <Mic className={cn("size-5", !compact && "mr-2")} />
        {compact ? null : busy ? "Listening…" : holding ? "Release to stop" : label}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
