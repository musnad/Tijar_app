"use client";

import { ArrowLeftRight, Mic, Square, Volume2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/context";
import { isTijarLanguage, TIJAR_LANGUAGE_NAMES, type TijarLanguageName } from "@/lib/translation/languages";
import { cn } from "@/lib/utils";
import { translateTextClient } from "@/services/translate-service";
import { HearItButton } from "./hear-it-button";
import { speakText, useSpeechRecognition } from "./use-speech";

/** Every language TIJAR can translate — Hausa included. */
const LANG_OPTIONS = TIJAR_LANGUAGE_NAMES;

type Result = {
  original: string;
  from: string;
  translated: string;
  to: string;
};

/**
 * Simple text-to-text translator: type → Translate → see the result.
 * Optional speak / Hear it. Original always kept above the translation.
 */
export function TranslatorScreen() {
  const { t } = useTranslation();
  const [fromLang, setFromLang] = useState<string>("English");
  const [toLang, setToLang] = useState<string>("Yoruba");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { listen, stop, listening, supported } = useSpeechRecognition();

  function swap() {
    setFromLang(toLang);
    setToLang(fromLang);
    if (result) {
      setInput(result.translated);
      setResult({
        original: result.translated,
        from: result.to,
        translated: result.original,
        to: result.from,
      });
    }
  }

  async function onMic() {
    setError(null);
    try {
      const transcript = await listen(fromLang);
      if (transcript) setInput(transcript);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("app.translator.voiceFailed"));
    }
  }

  async function translate(alsoSpeak: boolean) {
    const text = input.trim();
    if (!text) return;
    setError(null);
    setBusy(true);

    if (!isTijarLanguage(fromLang) || !isTijarLanguage(toLang)) {
      setResult(null);
      setError(t("app.translator.translationFailed"));
      setBusy(false);
      return;
    }

    if (fromLang === toLang) {
      setResult(null);
      setError(t("app.translator.sameLanguage"));
      setBusy(false);
      return;
    }

    const response = await translateTextClient({
      text,
      fromLanguage: fromLang as TijarLanguageName,
      toLanguage: toLang as TijarLanguageName,
    });
    setBusy(false);

    if (!response.ok) {
      setResult(null);
      setError(response.message);
      toast.error(response.message);
      return;
    }

    const next: Result = {
      original: text,
      from: fromLang,
      translated: response.translatedText,
      to: toLang,
    };
    setResult(next);
    if (alsoSpeak) void speakText(next.translated, toLang);
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-8">
      <h1 className="text-2xl font-extrabold">{t("app.translator.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("app.translator.simpleSubtitle")}</p>

      {/* From / To */}
      <div className="mt-5 flex items-end gap-2">
        <label className="flex-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {t("app.translator.fromLabel")}
          <select
            value={fromLang}
            onChange={(e) => setFromLang(e.target.value)}
            className="mt-1 min-h-12 w-full rounded-xl border border-input bg-background px-3 text-base font-semibold text-foreground"
          >
            {LANG_OPTIONS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="mb-0.5 size-12 shrink-0 rounded-xl"
          onClick={swap}
          aria-label={t("app.translator.swapLanguages")}
        >
          <ArrowLeftRight className="size-5" />
        </Button>
        <label className="flex-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {t("app.translator.toLabel")}
          <select
            value={toLang}
            onChange={(e) => setToLang(e.target.value)}
            className="mt-1 min-h-12 w-full rounded-xl border border-input bg-background px-3 text-base font-semibold text-foreground"
          >
            {LANG_OPTIONS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Input */}
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={4}
        placeholder={t("app.translator.typeOrSpeak")}
        className="mt-4 w-full rounded-2xl border border-input bg-background px-4 py-3 text-base leading-relaxed"
        aria-label={t("app.translator.fromLabel")}
      />

      <div className="mt-3 flex flex-wrap gap-2">
        {supported &&
          (listening ? (
            <Button type="button" variant="destructive" className="min-h-12 flex-1 rounded-xl" onClick={stop}>
              <Square className="mr-1.5 size-4" /> {t("app.translator.stop")}
            </Button>
          ) : (
            <Button type="button" variant="outline" className="min-h-12 rounded-xl px-4" onClick={onMic}>
              <Mic className="mr-1.5 size-4" /> {t("app.translator.speak")}
            </Button>
          ))}
        <Button
          type="button"
          className="min-h-12 flex-[2] rounded-xl text-base font-bold"
          disabled={busy || !input.trim()}
          onClick={() => void translate(false)}
        >
          {busy ? t("app.translator.translating") : t("app.translator.translate")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="min-h-12 rounded-xl px-4 font-bold"
          disabled={busy || !input.trim()}
          onClick={() => void translate(true)}
        >
          <Volume2 className="mr-1.5 size-4" /> {t("app.translator.translateSpeak")}
        </Button>
      </div>

      {/* Result — always show after translate */}
      {error && (
        <div className="mt-5 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
          {error}
        </div>
      )}

      {result && (
        <section className="mt-5 space-y-3" aria-live="polite">
          <div className="rounded-2xl border border-border bg-muted/40 p-4">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
              {t("app.translator.youWrote").replace("{language}", result.from)}
            </p>
            <p className="mt-1 text-base leading-relaxed">{result.original}</p>
          </div>
          <div
            className={cn(
              "rounded-2xl border-2 border-primary/40 bg-primary/5 p-4 shadow-sm",
            )}
          >
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-primary">
              {t("app.translator.translationLabel").replace("{language}", result.to)}
            </p>
            <p className="mt-2 text-xl font-bold leading-relaxed text-foreground">{result.translated}</p>
            <HearItButton
              text={result.translated}
              language={result.to}
              label={t("app.translator.hearIt")}
              stopLabel={t("app.translator.stop")}
              className="mt-3 bg-card"
            />
          </div>
        </section>
      )}

      {!result && !error && (
        <p className="mt-8 text-center text-sm text-muted-foreground">{t("app.translator.emptySimple")}</p>
      )}
    </div>
  );
}
