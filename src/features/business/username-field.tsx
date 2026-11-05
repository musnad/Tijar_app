"use client";

import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { isSlugAvailable } from "@/services/discover-service";
import { isValidSlug, slugifyBusinessName } from "@/utils/discover";
import { cn } from "@/lib/utils";

export type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid";

export function UsernameField({
  value,
  exceptBusinessId,
  onChange,
  onStatusChange,
  tone = "dark",
}: {
  value: string;
  exceptBusinessId: string;
  onChange: (value: string) => void;
  onStatusChange?: (status: UsernameStatus) => void;
  tone?: "dark" | "light";
}) {
  const dark = tone === "dark";
  const [status, setStatus] = useState<UsernameStatus>("idle");

  useEffect(() => {
    const slug = slugifyBusinessName(value);
    if (!slug) {
      setStatus("idle");
      onStatusChange?.("idle");
      return;
    }
    if (!isValidSlug(slug)) {
      setStatus("invalid");
      onStatusChange?.("invalid");
      return;
    }
    setStatus("checking");
    onStatusChange?.("checking");
    const timer = window.setTimeout(() => {
      void isSlugAvailable(slug, exceptBusinessId).then((ok) => {
        const next = ok ? "available" : "taken";
        setStatus(next);
        onStatusChange?.(next);
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [value, exceptBusinessId]);

  const label =
    status === "checking"
      ? "Checking…"
      : status === "available"
        ? "Available"
        : status === "taken"
          ? "Not available — pick another"
          : status === "invalid"
            ? "Use letters or numbers, at least 2 characters"
            : "This is your @username on TIJAR";

  return (
    <div>
      <div className="relative">
        <span
          className={cn(
            "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold",
            dark ? "text-white/50" : "text-muted-foreground",
          )}
        >
          @
        </span>
        <Input
          className={cn(
            "min-h-12 pl-8 text-sm font-semibold",
            dark
              ? "border-0 bg-white/10 text-white placeholder:text-white/40"
              : "rounded-xl border-border bg-background",
          )}
          value={value}
          onChange={(e) =>
            onChange(
              e.target.value
                .replace(/^@/, "")
                .toLowerCase()
                .replace(/[^a-z0-9-]+/g, "-")
                .replace(/--+/g, "-"),
            )
          }
          placeholder="yourshop"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>
      <p
        className={cn(
          "mt-1.5 text-[12px] font-semibold",
          status === "available" && (dark ? "text-[#00B86B]" : "text-[#1F7A4D]"),
          status === "taken" && (dark ? "text-red-300" : "text-destructive"),
          status === "invalid" && (dark ? "text-amber-200" : "text-amber-700"),
          (status === "idle" || status === "checking") && (dark ? "text-white/70" : "text-muted-foreground"),
        )}
      >
        {label}
      </p>
    </div>
  );
}
