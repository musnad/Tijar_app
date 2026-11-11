"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Check,
  Mic,
  ReceiptText,
  Send,
  ShoppingBag,
  Square,
  Volume2,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { speakText, useSpeechPlayback, useSpeechRecognition } from "@/features/translate/use-speech";
import { usePrimaryBusiness } from "@/hooks/use-primary-business";
import { invalidateBusinessQueries } from "@/lib/invalidate-business-queries";
import { useTranslation } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/types";
import {
  isTijarLanguage,
  LANGUAGE_CHIP,
  TIJAR_PICKER_LANGUAGES,
} from "@/lib/translation/languages";
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

const SPEAK_LANGS = TIJAR_PICKER_LANGUAGES;

const LOCALE_TO_SPEAK_LANG: Partial<Record<Locale, string>> = {
  en: "English",
  ha: "Hausa",
  sw: "Swahili",
  yo: "Yoruba",
  ig: "Igbo",
  ar: "Arabic",
};

const INTENT_META: Record<VoiceIntentType, { labelKey: string; icon: typeof ShoppingBag; className: string }> = {
  sale: { labelKey: "app.assistant.intentSale", icon: ShoppingBag, className: "bg-emerald-500/15 text-emerald-800" },
  expense: { labelKey: "app.assistant.intentExpense", icon: Wallet, className: "bg-rose-500/10 text-rose-800" },
  purchase: { labelKey: "app.assistant.intentPurchase", icon: ReceiptText, className: "bg-sky-500/10 text-sky-800" },
  customer_payment: { labelKey: "app.assistant.intentCustomerPayment", icon: ShoppingBag, className: "bg-teal-500/10 text-teal-800" },
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

function chipLabel(name: string): string {
  return LANGUAGE_CHIP[name] ?? name;
}

function LanguageChips({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
}) {
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="listbox" aria-label={ariaLabel}>
      {SPEAK_LANGS.map((l) => {
        const selected = value === l;
        return (
          <button
            key={l}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => onChange(l)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors",
              selected
                ? "bg-[#0B1F4D] text-white shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            {chipLabel(l)}
          </button>
        );
      })}
    </div>
  );
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
  const [langB, setLangB] = useState("Arabic");
  const [chatInput, setChatInput] = useState("");
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
  }, [booksTurns, draft]);

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
    if (speakLang !== "English" && canTranslatePair("English", speakLang)) {
      const translated = await translateTextClient({
        text: english,
        fromLanguage: "English",
        toLanguage: speakLang,
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
    const result = await translateTextClient({
      text,
      fromLanguage: speakLang,
      toLanguage: "English",
    });
    return result.ok ? result.translatedText : null;
  }

  async function understand(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    recordYouSaid(trimmed);

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
          mode: "books",
        }),
      });
      const json = (await res.json()) as {
        reply?: string;
        error?: string;
        draft?: ParsedVoiceCommand;
      };
      if (json.draft && json.draft.intent && json.draft.intent !== "unknown") {
        setDraft(json.draft);
        sayBooks(json.reply?.trim() || summarizeDraft(json.draft, summaryStrings()));
        return;
      }
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

  async function onChatMic() {
    setActiveSpeaker("A");
    try {
      const transcript = await listen(langA);
      if (transcript) setChatInput(transcript);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("app.assistant.voiceFailed"));
    } finally {
      setActiveSpeaker(null);
    }
  }

  async function sendChat() {
    const text = chatInput.trim();
    if (!text) return;
    const from = langA;
    const to = langB;
    setBusy(true);
    let spoken = text;
    if (canTranslatePair(from, to)) {
      const result = await translateTextClient({
        text,
        fromLanguage: from,
        toLanguage: to,
      });
      if (result.ok) spoken = result.translatedText;
      else toast.message(t("app.assistant.speakOriginalFallback"));
    } else if (from !== to) {
      toast.message(t("app.assistant.speakOriginalFallback"));
    }
    setChatLast({ from, to, original: text, translated: spoken });
    setBusy(false);
    await speakText(spoken, to);
    setChatInput("");
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
  const DraftIcon = draftMeta?.icon ?? ShoppingBag;
  const booksListening = listening && activeSpeaker === "books";
  const chatListening = listening && activeSpeaker === "A";

  return (
    <div className="mx-auto flex max-w-md flex-col pb-8">
      <h1 className="text-2xl font-extrabold tracking-tight text-[#0B1F4D]">Talk to TIJAR</h1>
      <p className="mt-1 text-sm text-muted-foreground">Say a sale or an expense. Confirm, then save. That is the whole page.</p>
      <div className="mt-3 grid grid-cols-2 rounded-full bg-muted p-1">
        <button
          type="button"
          onClick={() => setMode("books")}
          className={cn(
            "min-h-10 rounded-full text-sm font-bold transition-colors",
            mode === "books" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
          )}
        >
          {t("app.assistant.modeBooks")}
        </button>
        <button
          type="button"
          onClick={() => setMode("chat")}
          className={cn(
            "min-h-10 rounded-full text-sm font-bold transition-colors",
            mode === "chat" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
          )}
        >
          {t("app.assistant.modeChat")}
        </button>
      </div>

      {mode === "books" && (
        <>
          <div className="mt-5 flex flex-col items-center">
            <button
              type="button"
              onClick={booksListening ? stop : onBooksMic}
              disabled={!supported}
              aria-label={booksListening ? t("app.assistant.stopListening") : t("app.assistant.startListening")}
              className={cn(
                "flex size-[5.5rem] items-center justify-center rounded-full text-white shadow-lg transition-transform active:scale-95 disabled:opacity-40",
                booksListening ? "bg-rose-600 shadow-rose-600/30" : "bg-[#1F7A4D] shadow-[#1F7A4D]/30",
              )}
            >
              {booksListening ? <Square className="size-7" /> : <Mic className="size-8" />}
            </button>
            <p className="mt-3 text-center text-sm font-semibold text-foreground">
              {booksListening
                ? t("app.assistant.listeningNow")
                : supported
                  ? t("app.assistant.tapMicBooks")
                  : t("app.assistant.unsupported")}
            </p>
            {business && (
              <p className="mt-1 max-w-[90%] truncate text-center text-xs text-muted-foreground">{business.business_name}</p>
            )}
          </div>

          <div className="mt-4">
            <LanguageChips
              value={speakLang}
              onChange={setSpeakLang}
              ariaLabel={t("app.assistant.speakLanguage")}
            />
          </div>

          <div className="mt-3 flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("app.assistant.inputPlaceholder")}
              rows={1}
              className="min-h-12 flex-1 resize-none rounded-2xl border border-input bg-background px-3.5 py-3 text-base outline-none focus:ring-2 focus:ring-[#1F7A4D]/30"
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
              className="size-12 shrink-0 rounded-2xl bg-[#0B1F4D] hover:bg-[#0B1F4D]/90"
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

          <button
            type="button"
            role="switch"
            aria-checked={speakReplies}
            onClick={() => setSpeakReplies((v) => !v)}
            className={cn("mt-2 self-start text-xs font-semibold", speakReplies ? "text-[#1F7A4D]" : "text-muted-foreground")}
          >
            {t("app.assistant.speakReplies")}
          </button>

          {draft && draftMeta && (
            <section className="mt-4 rounded-3xl border border-[#1F7A4D]/30 bg-card p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("app.assistant.checkRecord")}</p>
              <div className="mt-3 flex items-center gap-3">
                <span className={cn("flex size-11 items-center justify-center rounded-2xl", draftMeta.className)}>
                  <DraftIcon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{t(draftMeta.labelKey)}</p>
                  {draft.amount !== null && draft.amount > 0 ? (
                    <p className="text-2xl font-extrabold tabular-nums">{formatNgn(draft.amount)}</p>
                  ) : (
                    <input
                      type="number"
                      inputMode="decimal"
                      min={1}
                      placeholder={t("app.assistant.amountNeeded")}
                      className="mt-1 w-full max-w-[10rem] rounded-xl border border-input bg-background px-3 py-2 text-xl font-extrabold tabular-nums outline-none"
                      onChange={(e) => {
                        const n = Number.parseFloat(e.target.value);
                        if (Number.isFinite(n) && n > 0) setDraft((prev) => (prev ? withAmount(prev, n) : prev));
                      }}
                    />
                  )}
                </div>
              </div>
              {draft.description ? (
                <p className="mt-2 text-sm text-muted-foreground">{draft.description}</p>
              ) : null}
              <div className="mt-4 flex gap-2">
                <Button
                  type="button"
                  className="min-h-11 flex-1 rounded-2xl bg-[#1F7A4D] font-bold hover:bg-[#1F7A4D]/90"
                  disabled={saving || !business || draft.amount === null || draft.amount <= 0}
                  onClick={confirmSave}
                >
                  <Check className="mr-1.5 size-4" /> {saving ? t("app.assistant.saving") : t("app.assistant.confirmSave")}
                </Button>
                <Button type="button" variant="ghost" className="min-h-11 rounded-2xl px-3" onClick={() => setDraft(null)}>
                  <X className="size-4" />
                </Button>
              </div>
            </section>
          )}

          {(booksTurns.length > 0 || busy) && (
            <section
              ref={threadRef}
              className="mt-4 max-h-[32vh] space-y-2 overflow-y-auto"
              aria-live="polite"
              aria-label={t("app.assistant.conversation")}
            >
              {booksTurns.map((turn) => (
                <article
                  key={turn.id}
                  className={cn(
                    "max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed",
                    turn.role === "you" ? "ms-auto bg-[#0B1F4D] text-white" : "bg-muted",
                  )}
                >
                  {turn.text}
                </article>
              ))}
            </section>
          )}

          {activity.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {activity.map((item) => (
                <li key={item.id} className="flex items-center gap-2 text-sm">
                  <Check className="size-4 text-[#1F7A4D]" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  <span className="font-bold tabular-nums">{formatNgn(item.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {mode === "chat" && (
        <section className="mt-5">
          <div className="flex items-center gap-2">
            <select
              value={langA}
              onChange={(e) => setLangA(e.target.value)}
              className="min-h-11 flex-1 rounded-2xl border border-input bg-background px-3 text-sm font-semibold"
              aria-label={t("app.assistant.personLanguage").replace("{speaker}", "A")}
            >
              {SPEAK_LANGS.map((l) => (
                <option key={l} value={l}>
                  {chipLabel(l)} · {l}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted"
              aria-label={t("app.assistant.swapLanguages")}
              onClick={() => {
                setLangA(langB);
                setLangB(langA);
              }}
            >
              <ArrowLeftRight className="size-4" />
            </button>
            <select
              value={langB}
              onChange={(e) => setLangB(e.target.value)}
              className="min-h-11 flex-1 rounded-2xl border border-input bg-background px-3 text-sm font-semibold"
              aria-label={t("app.assistant.personLanguage").replace("{speaker}", "B")}
            >
              {SPEAK_LANGS.map((l) => (
                <option key={l} value={l}>
                  {chipLabel(l)} · {l}
                </option>
              ))}
            </select>
          </div>

          <textarea
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            rows={3}
            placeholder={t("app.assistant.typeOrSpeak")}
            className="mt-4 w-full resize-none rounded-2xl border border-input bg-background px-3.5 py-3 text-base outline-none focus:ring-2 focus:ring-[#1F7A4D]/30"
          />
          <div className="mt-3 flex gap-2">
            {supported && (
              <Button
                type="button"
                variant={chatListening ? "destructive" : "outline"}
                className="min-h-11 rounded-2xl"
                onClick={() => (chatListening ? stop() : void onChatMic())}
              >
                {chatListening ? <Square className="mr-1.5 size-4" /> : <Mic className="mr-1.5 size-4" />}
                {chatListening ? t("app.assistant.stop") : t("app.assistant.speak")}
              </Button>
            )}
            <Button
              type="button"
              className="min-h-11 flex-1 rounded-2xl bg-[#0B1F4D] font-bold hover:bg-[#0B1F4D]/90"
              disabled={busy || !chatInput.trim()}
              onClick={() => void sendChat()}
            >
              <Volume2 className="mr-1.5 size-4" /> {t("app.assistant.translateSpeak")}
            </Button>
          </div>

          {chatLast && (
            <div className="mt-5 space-y-2">
              <p className="rounded-2xl bg-muted px-3.5 py-2.5 text-[15px]">{chatLast.original}</p>
              <p className="rounded-2xl bg-[#0B1F4D] px-3.5 py-3 text-lg font-bold leading-relaxed text-white">
                {chatLast.translated}
              </p>
              {ttsSpeaking && (
                <Button type="button" variant="ghost" size="sm" className="rounded-full" onClick={stopTts}>
                  <Square className="mr-1 size-3.5" /> {t("app.assistant.stop")}
                </Button>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
