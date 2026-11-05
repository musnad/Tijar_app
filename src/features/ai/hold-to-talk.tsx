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
}: {
  language: string;
  disabled?: boolean;
  onTranscript: (text: string) => void;
  label: string;
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
    <div className="space-y-2">
      <Button
        type="button"
        disabled={disabled || busy}
        className={cn(
          "min-h-16 w-full touch-none rounded-2xl text-base font-bold",
          holding ? "bg-[#00B86B] text-white" : "bg-[#0A2540] text-white hover:bg-[#0A2540]/90",
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
        <Mic className="mr-2 size-5" />
        {busy ? "Listening…" : holding ? "Release to stop" : label}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
