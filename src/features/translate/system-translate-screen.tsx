"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/context";
import { TIJAR_PICKER_LANGUAGES, type TijarLanguageName } from "@/lib/translation/languages";
import { aiFetch } from "@/lib/ai/client-fetch";

/**
 * Admin tool to translate Tijar system/UI strings with Grok.
 * Output is reviewed by a human, then committed into
 * src/lib/i18n/messages/*.ts — runtime UI never machine-translates silently.
 */
export function SystemTranslateScreen() {
  const { t } = useTranslation();
  const [source, setSource] = useState("Fresh rice\nHow much is this?\nThank you, come again");
  const [from, setFrom] = useState<TijarLanguageName>("English");
  const [to, setTo] = useState<TijarLanguageName>("Hausa");
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    const texts = source.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 20);
    if (texts.length === 0) return;
    setBusy(true);
    try {
      const res = await aiFetch("/api/translate-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts, fromLanguage: from, toLanguage: to }),
      });
      const body = (await res.json().catch(() => null)) as { translations?: string[]; error?: { message: string } } | null;
      if (!res.ok || !body?.translations) {
        toast.error(body?.error?.message ?? t("app.translator.translationFailed"));
        return;
      }
      setOutput(JSON.stringify(Object.fromEntries(texts.map((t, i) => [t, body.translations![i]])), null, 2));
      toast.success(t("app.translator.translatedReview"));
    } catch {
      toast.error(t("app.translator.translationServiceUnreachable"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 space-y-4">
      <p className="text-sm text-muted-foreground">
        {t("app.translator.systemIntroStart")}
        <code className="mx-1 rounded bg-muted px-1">src/lib/i18n/messages/</code>
        {t("app.translator.systemIntroExample")} <code className="rounded bg-muted px-1">sw.ts</code>{t("app.translator.systemIntroHausa")} <code className="rounded bg-muted px-1">ha.ts</code> {t("app.translator.systemIntroEnd")}
      </p>
      <div className="flex flex-wrap gap-2">
        <select value={from} onChange={(e) => setFrom(e.target.value as TijarLanguageName)} className="min-h-11 rounded-xl border border-input bg-background px-2" aria-label={t("app.translator.fromLabel")}>
          {TIJAR_PICKER_LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={to} onChange={(e) => setTo(e.target.value as TijarLanguageName)} className="min-h-11 rounded-xl border border-input bg-background px-2" aria-label={t("app.translator.toLabel")}>
          {TIJAR_PICKER_LANGUAGES.filter((l) => l !== from).map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <Button type="button" className="min-h-11 rounded-xl font-bold" disabled={busy} onClick={run}>{busy ? t("app.translator.translating") : t("app.translator.translateStrings")}</Button>
      </div>
      <textarea value={source} onChange={(e) => setSource(e.target.value)} rows={6} className="w-full rounded-xl border border-input bg-background px-3 py-2 text-base" aria-label={t("app.translator.stringsInputLabel")} />
      {output && <pre className="overflow-x-auto rounded-xl bg-muted p-3 text-xs">{output}</pre>}
    </div>
  );
}
