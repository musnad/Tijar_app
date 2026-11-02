"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  BadgeCheck,
  Banknote,
  Check,
  MessagesSquare,
  Mic,
  PackagePlus,
  ReceiptText,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Square,
  Volume2,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { HearItButton } from "@/features/translate/hear-it-button";
import { speakText, useSpeechPlayback, useSpeechRecognition } from "@/features/translate/use-speech";
import { usePrimaryBusiness } from "@/hooks/use-primary-business";
import { invalidateBusinessQueries } from "@/lib/invalidate-business-queries";
import { useTranslation } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/types";
import { isTijarLanguage, TIJAR_LANGUAGE_NAMES, type TijarLanguageName } from "@/lib/translation/languages";
import { cn } from "@/lib/utils";
import { createTransaction, fetchPeriodAnalytics, fetchTodayTotals } from "@/services/transaction-service";
import { translateTextClient } from "@/services/translate-service";
import { buildExplanation, parseExplainRequest } from "@/utils/explain";
import { formatNgn } from "@/utils/money";
import {
  parseAmount,
  parseVoiceCommandWithHint,
  summarizeDraft,
  withAmount,
  type ParsedVoiceCommand,
  type VoiceIntentType,
} from "@/utils/voice-intent";

const SPEAK_LANGS = TIJAR_LANGUAGE_NAMES;

const LOCALE_TO_SPEAK_LANG: Partial<Record<Locale, string>> = {
  en: "English",
  ha: "Hausa",
  sw: "Swahili",
  yo: "Yoruba",
};

const INTENT_META: Record<VoiceIntentType, { labelKey: string; icon: typeof ShoppingBag; className: string }> = {
  sale: { labelKey: "app.assistant.intentSale", icon: ShoppingBag, className: "bg-primary/15 text-primary" },
  expense: { labelKey: "app.assistant.intentExpense", icon: Wallet, className: "bg-destructive/10 text-destructive" },
  purchase: { labelKey: "app.assistant.intentPurchase", icon: PackagePlus, className: "bg-primary/10 text-primary" },
  customer_payment: { labelKey: "app.assistant.intentCustomerPayment", icon: Banknote, className: "bg-teal-100 text-teal-800" },
  supplier_payment: { labelKey: "app.assistant.intentSupplierPayment", icon: ReceiptText, className: "bg-primary/10 text-primary" },
};

type Mode = "books" | "chat";

type BooksTurn = {
  id: number;
  kind: "books";
  role: "you" | "tijar";
  text: string;
  lang: string;
  at: string;
};

type ActivityItem = { id: number; label: string; amount: number; at: string };

function nowTime(): string {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function canTranslatePair(from: string, to: string): boolean {
  return from !== to && isTijarLanguage(from) && isTijarLanguage(to);
}

export function AssistantScreen() {
  const { profile } = useAuth();
  const { t, locale } = useTranslation();
  const { data } = usePrimaryBusiness(profile?.id);
  const business = data?.business ?? null;
  const queryClient = useQueryClient();
  const threadRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<ParsedVoiceCommand | null>(null);

  const [mode, setMode] = useState<Mode>("books");
  const [speakLang, setSpeakLang] = useState("English");
  const [speakReplies, setSpeakReplies] = useState(true);
  const [langA, setLangA] = useState("English");
  const [langB, setLangB] = useState("Yoruba");
  const [draftA, setDraftA] = useState("");
  const [draftB, setDraftB] = useState("");
  const [input, setInput] = useState("");
  const [activeSpeaker, setActiveSpeaker] = useState<"A" | "B" | "books" | null>(null);
  const [draft, setDraftState] = useState<ParsedVoiceCommand | null>(null);
  function setDraft(next: ParsedVoiceCommand | null | ((prev: ParsedVoiceCommand | null) => ParsedVoiceCommand | null)) {
    setDraftState((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      draftRef.current = value;
      return value;
    });
  }
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [speakingStatus, setSpeakingStatus] = useState<string | null>(null);
  const [booksTurns, setBooksTurns] = useState<BooksTurn[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [chatLast, setChatLast] = useState<{
    from: string;
    to: string;
    original: string;
    translated: string;
  } | null>(null);
  const { listen, stop, listening, supported } = useSpeechRecognition();
  const { speaking: ttsSpeaking, stop: stopTts } = useSpeechPlayback();

  useEffect(() => {
    const mapped = LOCALE_TO_SPEAK_LANG[locale];
    if (mapped) {
      setSpeakLang(mapped);
      setLangA(mapped);
    }
  }, [locale]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [booksTurns, draft, speakingStatus]);

  function sayBooks(text: string, lang = speakLang) {
    setBooksTurns((prev) => [
      ...prev,
      { id: Date.now() + Math.random(), kind: "books", role: "tijar", text, lang, at: nowTime() },
    ]);
    if (speakReplies) void speakText(text, lang);
  }

  function recordYouSaid(text: string, lang = speakLang) {
    setBooksTurns((prev) => [
      ...prev,
      { id: Date.now() + Math.random(), kind: "books", role: "you", text, lang, at: nowTime() },
    ]);
  }

  async function explain(metric: NonNullable<ReturnType<typeof parseExplainRequest>>) {
    if (!business) {
      sayBooks(t("app.assistant.needBusinessReply"));
      return;
    }
    sayBooks(t("app.assistant.checkingReply"));
    const [period, today] = await Promise.all([
      fetchPeriodAnalytics(business.id, 30),
      fetchTodayTotals(business.id),
    ]);
    const english = buildExplanation(metric, {
      sales30: period.current.sales,
      expenses30: period.current.expenses,
      profit30: period.current.profit,
      salesToday: today.sales,
      expensesToday: today.expenses,
      customerCreditTotal: null,
      healthScore: null,
    });
    if (canTranslatePair("English", speakLang)) {
      const translated = await translateTextClient({
        text: english,
        fromLanguage: "English",
        toLanguage: speakLang as TijarLanguageName,
      });
      sayBooks(translated.ok ? translated.translatedText : english);
      return;
    }
    sayBooks(english);
  }

  function summaryStrings() {
    return {
      unknown: t("app.assistant.summaryUnknown"),
      text: t("app.assistant.summaryText"),
      needAmount: t("app.assistant.summaryNeedAmount"),
      labels: {
        sale: t("app.assistant.intentSale"),
        expense: t("app.assistant.intentExpense"),
        purchase: t("app.assistant.intentPurchase"),
        customer_payment: t("app.assistant.intentCustomerPayment"),
        supplier_payment: t("app.assistant.intentSupplierPayment"),
      } as Record<VoiceIntentType, string>,
    };
  }

  async function englishHintForBooks(text: string): Promise<string | null> {
    if (speakLang === "English" || !canTranslatePair(speakLang, "English")) return null;
    setSpeakingStatus(t("app.assistant.translatingForBooks"));
    const result = await translateTextClient({
      text,
      fromLanguage: speakLang as TijarLanguageName,
      toLanguage: "English",
    });
    setSpeakingStatus(null);
    return result.ok ? result.translatedText : null;
  }

  async function understand(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    recordYouSaid(trimmed);

    // Follow-up: draft already knows the type (e.g. sale) but needs an amount.
    const pending = draftRef.current;
    if (pending && pending.intent !== "unknown" && (pending.amount === null || pending.amount <= 0)) {
      const onlyAmount = parseAmount(trimmed);
      if (onlyAmount !== null && onlyAmount > 0) {
        const next = withAmount(pending, onlyAmount);
        setDraft(next);
        sayBooks(summarizeDraft(next, summaryStrings()));
        return;
      }
    }

    const metric = parseExplainRequest(trimmed);
    if (metric) {
      setDraft(null);
      void explain(metric);
      return;
    }

    const hint = await englishHintForBooks(trimmed);
    const cmd = parseVoiceCommandWithHint(trimmed, hint);
    if (cmd.intent !== "unknown") {
      setDraft(cmd);
      sayBooks(summarizeDraft(cmd, summaryStrings()));
      return;
    }
    setDraft(null);
    setBusy(true);
    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          language: speakLang,
          shop: business?.business_name ?? "",
        }),
      });
      const json = (await res.json()) as { reply?: string; error?: string };
      sayBooks(json.reply?.trim() || json.error || t("app.assistant.summaryUnknown"));
    } catch {
      sayBooks(t("app.assistant.summaryUnknown"));
    } finally {
      setBusy(false);
    }
  }

  async function onBooksMic() {
    setActiveSpeaker("books");
    try {
      const transcript = await listen(speakLang);
      if (transcript) {
        setInput(transcript);
        await understand(transcript);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("app.assistant.voiceFailed"));
    } finally {
      setActiveSpeaker(null);
    }
  }

  async function onChatMic(speaker: "A" | "B") {
    setActiveSpeaker(speaker);
    const lang = speaker === "A" ? langA : langB;
    try {
      const transcript = await listen(lang);
      if (speaker === "A") setDraftA(transcript);
      else setDraftB(transcript);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("app.assistant.voiceFailed"));
    } finally {
      setActiveSpeaker(null);
    }
  }

  async function sendChat(speaker: "A" | "B") {
    const text = (speaker === "A" ? draftA : draftB).trim();
    if (!text) return;
    const from = speaker === "A" ? langA : langB;
    const to = speaker === "A" ? langB : langA;

    setBusy(true);
    setSpeakingStatus(t("app.assistant.speakingNow").replace("{language}", to));
    let spoken = text;
    if (canTranslatePair(from, to)) {
      const result = await translateTextClient({
        text,
        fromLanguage: from as TijarLanguageName,
        toLanguage: to as TijarLanguageName,
      });
      if (result.ok) {
        spoken = result.translatedText;
      } else {
        toast.message(t("app.assistant.speakOriginalFallback"));
      }
    }
    setChatLast({ from, to, original: text, translated: spoken });
    setBusy(false);
    await speakText(spoken, to);
    if (speaker === "A") setDraftA("");
    else setDraftB("");
    setSpeakingStatus(null);
  }

  async function confirmSave() {
    if (!draft || draft.intent === "unknown" || draft.amount === null || !business || !profile) return;
    setSaving(true);
    const { error } = await createTransaction(business.id, profile.id, {
      type: draft.intent,
      amount: draft.amount,
      description: draft.description || undefined,
      paymentMethod: "cash",
    });
    setSaving(false);
    if (error) {
      toast.error(error);
      sayBooks(t("app.assistant.saveFailedReply"));
      return;
    }
    const meta = INTENT_META[draft.intent];
    const label = t(meta.labelKey);
    setActivity((prev) => [
      {
        id: Date.now(),
        label: `${label}${draft.description ? ` · ${draft.description}` : ""}`,
        amount: draft.amount!,
        at: nowTime(),
      },
      ...prev,
    ]);
    toast.success(t("app.assistant.recordSaved"));
    sayBooks(
      t("app.assistant.savedReply").replace("{label}", label).replace("{amount}", formatNgn(draft.amount)),
    );
    setDraft(null);
    setInput("");
    invalidateBusinessQueries(queryClient, business.id);
  }

  const draftMeta = draft && draft.intent !== "unknown" ? INTENT_META[draft.intent] : null;
  const DraftIcon = draftMeta?.icon ?? Sparkles;

  return (
    <div className="mx-auto flex max-w-xl flex-col pb-6">
      {/* Hero */}
      <section className="dashboard-summary-card relative mt-2 overflow-hidden rounded-3xl p-5 text-primary-foreground shadow-xl sm:p-6">
        <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
              <Sparkles className="size-6" />
            </span>
            <div>
              <h2 className="text-lg font-extrabold leading-tight">{t("app.assistant.title")}</h2>
              <p className="text-xs text-white/75">{t("app.assistant.subtitle")}</p>
            </div>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1",
              listening ? "bg-red-400/25 text-white ring-red-200/40" : "bg-white/15 text-white ring-white/25",
            )}
            aria-live="polite"
          >
            <span className={cn("size-1.5 rounded-full", listening ? "animate-pulse bg-red-300" : "bg-emerald-300")} />
            {listening ? t("app.assistant.listening") : t("app.assistant.ready")}
          </span>
        </div>
        <p className="relative mt-3 text-sm leading-relaxed text-white/85">{t("app.assistant.heroBodyFull")}</p>
        {business && (
          <p className="relative mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full bg-black/15 px-2.5 py-1 text-xs font-semibold text-white/90">
            <BadgeCheck className="size-3.5 shrink-0" />
            <span className="truncate">{business.business_name}</span>
          </p>
        )}
      </section>

      {/* Mode tabs */}
      <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-border bg-muted/40 p-1">
        <button
          type="button"
          onClick={() => setMode("books")}
          className={cn(
            "flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold transition-colors",
            mode === "books" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
          )}
        >
          <ReceiptText className="size-4" /> {t("app.assistant.modeBooks")}
        </button>
        <button
          type="button"
          onClick={() => setMode("chat")}
          className={cn(
            "flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold transition-colors",
            mode === "chat" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
          )}
        >
          <MessagesSquare className="size-4" /> {t("app.assistant.modeChat")}
        </button>
      </div>

      {/* Conversation thread */}
      <section
        ref={threadRef}
        className="mt-4 max-h-[42vh] min-h-[180px] space-y-3 overflow-y-auto rounded-3xl border border-border bg-card p-4 shadow-sm"
        aria-live="polite"
        aria-label={t("app.assistant.conversation")}
      >
        {mode === "books" && booksTurns.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("app.assistant.emptyBooks")}</p>
        )}
        {mode === "chat" && (
          <div className="flex min-h-[140px] flex-col gap-3 py-2">
            {!chatLast && !ttsSpeaking && !listening && (
              <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
                <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Volume2 className="size-7" />
                </span>
                <p className="text-sm font-semibold">{t("app.assistant.emptyChatSpeakOnly")}</p>
                <p className="max-w-xs text-xs text-muted-foreground">{t("app.assistant.chatHintSpeakOnly")}</p>
              </div>
            )}
            {(ttsSpeaking || listening) && (
              <p className="text-center text-sm font-semibold text-primary">
                {ttsSpeaking
                  ? speakingStatus ?? t("app.assistant.speakingNow").replace("{language}", "")
                  : t("app.assistant.listeningNow")}
              </p>
            )}
            {chatLast && (
              <>
                <article className="rounded-2xl bg-muted/70 p-3">
                  <p className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
                    {chatLast.from}
                  </p>
                  <p className="mt-1 text-[15px] leading-relaxed">{chatLast.original}</p>
                </article>
                <article className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-3">
                  <p className="text-[11px] font-extrabold uppercase tracking-wide text-primary">{chatLast.to}</p>
                  <p className="mt-1 text-lg font-bold leading-relaxed">{chatLast.translated}</p>
                  <HearItButton
                    text={chatLast.translated}
                    language={chatLast.to}
                    label={t("app.assistant.hearIt")}
                    stopLabel={t("app.assistant.stop")}
                    className="mt-2 bg-card"
                  />
                </article>
              </>
            )}
            {ttsSpeaking && (
              <Button type="button" variant="outline" size="sm" className="mx-auto rounded-full" onClick={stopTts}>
                <Square className="mr-1 size-3.5" /> {t("app.assistant.stop")}
              </Button>
            )}
          </div>
        )}

        {mode === "books" &&
          booksTurns.map((turn) => (
            <article
              key={turn.id}
              className={cn(
                "max-w-[90%] rounded-2xl p-3",
                turn.role === "you" ? "ms-auto bg-primary/10" : "bg-muted/70",
              )}
            >
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
                {turn.role === "you" ? t("app.assistant.youSaid") : "TIJAR"} · {turn.at}
              </p>
              <p className="mt-1 text-[15px] leading-relaxed">{turn.text}</p>
              <HearItButton
                text={turn.text}
                language={turn.lang}
                label={t("app.assistant.hearIt")}
                stopLabel={t("app.assistant.stop")}
                className="mt-2 bg-card"
              />
            </article>
          ))}
      </section>

      {/* Draft confirmation (books) — sale/expense etc.; amount can be filled in */}
      {mode === "books" && draft && draftMeta && (
        <section className="mt-4 overflow-hidden rounded-3xl border-2 border-primary/50 bg-card shadow-lg">
          <div className="flex items-center justify-between gap-2 bg-primary/5 px-5 py-3.5">
            <p className="flex items-center gap-2 font-extrabold">
              <ReceiptText className="size-5 text-primary" /> {t("app.assistant.checkRecord")}
            </p>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-extrabold",
                draft.confidence === "high" ? "bg-primary/15 text-primary" : "bg-primary/10 text-primary",
              )}
            >
              {draft.confidence === "high" ? t("app.assistant.understoodClearly") : t("app.assistant.checkCarefully")}
            </span>
          </div>
          <div className="px-5 py-4">
            <div className="flex items-center gap-3">
              <span className={cn("flex size-12 items-center justify-center rounded-2xl", draftMeta.className)}>
                <DraftIcon className="size-6" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t(draftMeta.labelKey)}</p>
                {draft.amount !== null && draft.amount > 0 ? (
                  <p className="text-3xl font-extrabold tabular-nums leading-none">{formatNgn(draft.amount)}</p>
                ) : (
                  <label className="mt-1 block">
                    <span className="sr-only">{t("app.assistant.amountNeeded")}</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={1}
                      step="any"
                      placeholder={t("app.assistant.amountNeeded")}
                      className="w-full max-w-[12rem] rounded-xl border border-input bg-background px-3 py-2 text-2xl font-extrabold tabular-nums outline-none focus:ring-2 focus:ring-primary/40"
                      onChange={(e) => {
                        const n = Number.parseFloat(e.target.value);
                        if (Number.isFinite(n) && n > 0) {
                          setDraft((prev) => (prev ? withAmount(prev, n) : prev));
                        }
                      }}
                    />
                    <span className="mt-1 block text-xs text-muted-foreground">{t("app.assistant.amountNeededHint")}</span>
                  </label>
                )}
              </div>
            </div>
            <dl className="mt-4 divide-y divide-border rounded-2xl bg-muted/50 text-sm">
              <div className="flex justify-between gap-3 px-3.5 py-2.5">
                <dt className="text-muted-foreground">{t("app.assistant.details")}</dt>
                <dd className="text-right font-semibold">{draft.description || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3 px-3.5 py-2.5">
                <dt className="text-muted-foreground">{t("app.assistant.payment")}</dt>
                <dd className="font-semibold">{t("app.assistant.cash")}</dd>
              </div>
            </dl>
            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                className="min-h-12 flex-1 rounded-2xl text-base font-bold shadow-md"
                disabled={saving || !business || draft.amount === null || draft.amount <= 0}
                onClick={confirmSave}
              >
                <Check className="mr-1.5 size-5" /> {saving ? t("app.assistant.saving") : t("app.assistant.confirmSave")}
              </Button>
              <Button type="button" variant="outline" className="min-h-12 rounded-2xl px-4" onClick={() => setDraft(null)}>
                <X className="mr-1 size-4" /> {t("app.assistant.cancel")}
              </Button>
            </div>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5" /> {t("app.assistant.nothingSaved")}
            </p>
          </div>
        </section>
      )}

      {/* Composer: Books */}
      {mode === "books" && (
        <section className="mt-4 rounded-3xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-col items-center">
            <button
              type="button"
              onClick={listening && activeSpeaker === "books" ? stop : onBooksMic}
              disabled={!supported}
              aria-label={listening ? t("app.assistant.stopListening") : t("app.assistant.startListening")}
              className={cn(
                "relative flex size-20 items-center justify-center rounded-full text-primary-foreground shadow-lg transition-all active:scale-95 disabled:opacity-50",
                listening && activeSpeaker === "books"
                  ? "bg-destructive shadow-destructive/30"
                  : "bg-primary shadow-primary/30",
              )}
            >
              {listening && activeSpeaker === "books" ? <Square className="size-7" /> : <Mic className="size-8" />}
            </button>
            <p className="mt-3 text-center text-sm font-semibold">
              {listening && activeSpeaker === "books"
                ? t("app.assistant.listeningNow")
                : supported
                  ? t("app.assistant.tapMicBooks")
                  : t("app.assistant.unsupported")}
            </p>
          </div>

          <div className="mt-4 flex items-end gap-2 border-t border-border pt-4">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("app.assistant.inputPlaceholder")}
              rows={2}
              className="min-h-12 flex-1 resize-none rounded-2xl border border-input bg-background px-3.5 py-3 text-base outline-none focus:ring-2 focus:ring-primary/40"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && input.trim()) {
                  e.preventDefault();
                  const value = input;
                  setInput("");
                  void understand(value);
                }
              }}
            />
            <Button
              type="button"
              className="size-12 shrink-0 rounded-2xl shadow-md"
              disabled={!input.trim() || busy}
              onClick={() => {
                const value = input;
                setInput("");
                void understand(value);
              }}
              aria-label={t("app.assistant.understand")}
            >
              <Send className="size-5" />
            </Button>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {t("app.assistant.speakLanguage")}
              </span>
              <select
                value={speakLang}
                onChange={(e) => setSpeakLang(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-medium"
              >
                {SPEAK_LANGS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {t("app.assistant.voiceReplies")}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={speakReplies}
                onClick={() => setSpeakReplies((v) => !v)}
                className={cn(
                  "flex min-h-11 w-full items-center justify-between rounded-xl border px-3 text-sm font-semibold",
                  speakReplies ? "border-primary/40 bg-primary/5 text-primary" : "border-input text-muted-foreground",
                )}
              >
                <span className="flex items-center gap-2">
                  <Volume2 className="size-4" /> {t("app.assistant.speakReplies")}
                </span>
                <span className={cn("relative h-6 w-11 rounded-full", speakReplies ? "bg-primary" : "bg-muted-foreground/30")}>
                  <span
                    className={cn(
                      "absolute top-0.5 size-5 rounded-full bg-white shadow transition-all",
                      speakReplies ? "left-[1.375rem]" : "left-0.5",
                    )}
                  />
                </span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Composer: Two-person chat */}
      {mode === "chat" && (
        <section className="mt-4 space-y-3">
          <div className="flex items-center justify-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{langA}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-full"
              aria-label={t("app.assistant.swapLanguages")}
              onClick={() => {
                setLangA(langB);
                setLangB(langA);
              }}
            >
              <ArrowLeftRight className="size-4" />
            </Button>
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{langB}</span>
          </div>

          {(["A", "B"] as const).map((speaker) => {
            const lang = speaker === "A" ? langA : langB;
            const setLang = speaker === "A" ? setLangA : setLangB;
            const draftText = speaker === "A" ? draftA : draftB;
            const setDraftText = speaker === "A" ? setDraftA : setDraftB;
            const isActive = listening && activeSpeaker === speaker;
            return (
              <div key={speaker} className="rounded-3xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-extrabold">
                    {t("app.assistant.person").replace("{speaker}", speaker)}
                  </p>
                  <select
                    value={lang}
                    onChange={(e) => setLang(e.target.value)}
                    className="min-h-10 rounded-xl border border-input bg-background px-2 text-sm font-medium"
                    aria-label={t("app.assistant.personLanguage").replace("{speaker}", speaker)}
                  >
                    {SPEAK_LANGS.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  rows={2}
                  placeholder={t("app.assistant.typeOrSpeak")}
                  className="mt-3 w-full resize-none rounded-2xl border border-input bg-background px-3.5 py-3 text-base outline-none focus:ring-2 focus:ring-primary/40"
                />
                <div className="mt-3 flex gap-2">
                  {supported && (
                    <Button
                      type="button"
                      variant={isActive ? "destructive" : "outline"}
                      className="min-h-11 flex-1 rounded-2xl font-semibold"
                      onClick={() => (isActive ? stop() : void onChatMic(speaker))}
                    >
                      {isActive ? (
                        <>
                          <Square className="mr-1.5 size-4" /> {t("app.assistant.stop")}
                        </>
                      ) : (
                        <>
                          <Mic className="mr-1.5 size-4" /> {t("app.assistant.speak")}
                        </>
                      )}
                    </Button>
                  )}
                  <Button
                    type="button"
                    className="min-h-11 flex-1 rounded-2xl font-bold"
                    disabled={busy || !draftText.trim()}
                    onClick={() => void sendChat(speaker)}
                  >
                    <Volume2 className="mr-1.5 size-4" /> {t("app.assistant.translateSpeak")}
                  </Button>
                </div>
                <p className="mt-2 text-center text-[11px] text-muted-foreground">
                  {t("app.assistant.chatHint")
                    .replace("{from}", lang)
                    .replace("{to}", speaker === "A" ? langB : langA)}
                </p>
              </div>
            );
          })}
        </section>
      )}

      {/* Session saved transactions */}
      {activity.length > 0 && (
        <section className="mt-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {t("app.assistant.savedThisSession")}
          </h3>
          <ul className="mt-2.5 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            {activity.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex size-8 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Check className="size-4" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.label}</span>
                <span className="text-sm font-extrabold tabular-nums">{formatNgn(item.amount)}</span>
                <span className="text-xs text-muted-foreground">{item.at}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
