"use client";

import { Check, Circle } from "lucide-react";

import { analyzePassword, type PasswordScore } from "@/lib/auth/password-strength";
import { cn } from "@/lib/utils";

const SCORE_LABEL: Record<Exclude<PasswordScore, "empty">, string> = {
  weak: "Weak",
  fair: "Fair",
  good: "Good",
  strong: "Strong",
};

const SCORE_BAR: Record<Exclude<PasswordScore, "empty">, string> = {
  weak: "w-1/4 bg-[#dc2626]",
  fair: "w-2/4 bg-[#d97706]",
  good: "w-3/4 bg-[#1B8A52]",
  strong: "w-full bg-[#15803d]",
};

const SCORE_TEXT: Record<Exclude<PasswordScore, "empty">, string> = {
  weak: "text-[#dc2626]",
  fair: "text-[#b45309]",
  good: "text-[#1B8A52]",
  strong: "text-[#15803d]",
};

export function PasswordStrengthHints({ password }: { password: string }) {
  if (!password) return null;

  const analysis = analyzePassword(password);
  if (analysis.score === "empty") return null;

  const liveHint = analysis.valid
    ? "This password is strong enough to use."
    : analysis.suggestions[0];

  return (
    <div className="space-y-2 pt-1" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#e8edf3]">
          <div className={cn("h-full rounded-full transition-all duration-200", SCORE_BAR[analysis.score])} />
        </div>
        <span className={cn("shrink-0 text-xs font-bold", SCORE_TEXT[analysis.score])}>
          {SCORE_LABEL[analysis.score]}
        </span>
      </div>
      <p className="text-xs leading-snug text-[#5a6578]">{liveHint}</p>
      <ul className="space-y-1">
        {analysis.checks.map((check) => (
          <li
            key={check.id}
            className={cn(
              "flex items-center gap-2 text-[11px] font-medium",
              check.met ? "text-[#1B8A52]" : "text-[#94a3b8]",
            )}
          >
            {check.met ? (
              <Check className="size-3.5 shrink-0" aria-hidden />
            ) : (
              <Circle className="size-3.5 shrink-0" aria-hidden />
            )}
            {check.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
