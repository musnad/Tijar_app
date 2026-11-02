"use client";

import { Square, Volume2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSpeechPlayback } from "./use-speech";

type HearItButtonProps = {
  text: string;
  language: string;
  label: string;
  stopLabel?: string;
  className?: string;
  size?: "sm" | "default";
};

/**
 * One-tap play / stop for spoken replies. Shows a pulse while speaking.
 */
export function HearItButton({
  text,
  language,
  label,
  stopLabel = "Stop",
  className,
  size = "sm",
}: HearItButtonProps) {
  const { speak, stop, speaking, supported } = useSpeechPlayback();

  // Browser TTS or server voice (audio element) — always offer Hear when we have text.
  if (!text.trim()) return null;
  if (!supported && typeof Audio === "undefined") return null;

  return (
    <Button
      type="button"
      size={size}
      variant="ghost"
      className={cn(
        "mt-1 min-h-8 rounded-full px-2.5 text-xs font-bold text-primary ring-1 ring-primary/25",
        speaking && "bg-primary/10",
        className,
      )}
      aria-label={speaking ? stopLabel : label}
      aria-pressed={speaking}
      onClick={() => {
        if (speaking) stop();
        else void speak(text, language);
      }}
    >
      {speaking ? (
        <>
          <Square className="mr-1 size-3.5 fill-current" /> {stopLabel}
        </>
      ) : (
        <>
          <Volume2 className={cn("mr-1 size-3.5", speaking && "animate-pulse")} /> {label}
        </>
      )}
    </Button>
  );
}
