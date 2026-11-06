"use client";

import { Languages } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/context";
import { languageForLocale, TIJAR_PICKER_LANGUAGES, type TijarLanguageName } from "@/lib/translation/languages";
import { translateTextClient } from "@/services/translate-service";

/**
 * Explicit translation control: the original is always preserved and the
 * translation appears alongside it. Nothing is sent or published
 * automatically. Default target follows the user's app language.
 */
export function TranslateText({
  text,
  fromLanguage: fromProp = "English",
  label = "Translate",
  allowSourceSelect = false,
  onUseTranslation,
}: {
  text: string;
  fromLanguage?: TijarLanguageName;
  label?: string;
  allowSourceSelect?: boolean;
  /** Optional owner action ("Use this text") — always an explicit click. */
  onUseTranslation?: (translated: string) => void;
}) {
  const { locale } = useTranslation();
  const [fromLanguage, setFromLanguage] = useState<TijarLanguageName>(fromProp);
  const defaultTarget = languageForLocale(locale) ?? "English";
  const [target, setTarget] = useState<TijarLanguageName>(
    defaultTarget === fromProp ? "English" : defaultTarget,
  );
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "done"; translated: string; cached: boolean }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function run() {
    setState({ kind: "loading" });
    const result = await translateTextClient({ text, fromLanguage, toLanguage: target });
    if (result.ok) setState({ kind: "done", translated: result.translatedText, cached: result.cached });
    else setState({ kind: "error", message: result.message });
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        {allowSourceSelect && (
          <select
            value={fromLanguage}
            onChange={(e) => setFromLanguage(e.target.value as TijarLanguageName)}
            className="min-h-9 rounded-lg border border-input bg-background px-2 text-xs"
            aria-label="Translate from"
          >
            {TIJAR_PICKER_LANGUAGES.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        )}
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value as TijarLanguageName)}
          className="min-h-9 rounded-lg border border-input bg-background px-2 text-xs"
          aria-label="Translate to"
        >
          {TIJAR_PICKER_LANGUAGES.filter((l) => l !== fromLanguage).map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        <Button type="button" size="sm" variant="outline" className="min-h-9 rounded-lg text-xs" onClick={run} disabled={state.kind === "loading" || !text.trim()}>
          <Languages className="mr-1 size-3.5" />
          {state.kind === "loading" ? "Translating…" : label}
        </Button>
      </div>

      {state.kind === "done" && (
        <div className="mt-3 rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 text-sm shadow-sm">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-primary">
            {target}{state.cached ? " · saved copy" : ""}
          </p>
          <p className="mt-2 text-base font-semibold leading-relaxed text-foreground">{state.translated}</p>
          {onUseTranslation && (
            <Button type="button" size="sm" className="mt-3 min-h-10 rounded-xl text-xs font-bold" onClick={() => onUseTranslation(state.translated)}>
              Use this translation
            </Button>
          )}
        </div>
      )}
      {state.kind === "error" && (
        <p className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive" role="alert">
          {state.message}
        </p>
      )}
    </div>
  );
}
