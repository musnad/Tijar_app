import { createFileRoute } from "@tanstack/react-router";

import { BOOKS_SYSTEM, type BooksExtract } from "@/lib/ai/seller-extract";
import { gatewayErrorResponse, replayDuplicateAi, runTimedProvider, startAiSession } from "@/lib/ai/gateway";
import { tijarAssistantChat } from "@/lib/ai/tijar-chat";
import {
  assertJsonContentType,
  assertTranslateOrigin,
  jsonSecure,
  readJsonBody,
  TRANSLATE_MAX_BODY_BYTES,
} from "@/lib/api/security";
import { grokJson, isXaiConfigured, XaiError } from "@/lib/xai/client";
import {
  parseVoiceCommandWithHint,
  summarizeDraft,
  type ParsedVoiceCommand,
  type VoiceIntentType,
} from "@/utils/voice-intent";

const BOOK_INTENTS: readonly VoiceIntentType[] = [
  "sale",
  "expense",
  "purchase",
  "customer_payment",
  "supplier_payment",
];

function isBookIntent(value: string): value is VoiceIntentType {
  return (BOOK_INTENTS as readonly string[]).includes(value);
}

function localDraft(text: string): ParsedVoiceCommand {
  return parseVoiceCommandWithHint(text);
}

function grokDraft(raw: BooksExtract, text: string): ParsedVoiceCommand {
  const local = localDraft(text);
  const intent = isBookIntent(raw.intent) ? raw.intent : local.intent;
  const amount =
    typeof raw.amountNaira === "number" && raw.amountNaira > 0 ? raw.amountNaira : local.amount;
  return {
    intent,
    amount,
    description: (raw.description || local.description || "").slice(0, 120),
    raw: text,
    confidence: raw.confidence === "high" ? "high" : "low",
  };
}

export const Route = createFileRoute("/api/assistant/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const origin = assertTranslateOrigin(request);
        if (!origin.ok) {
          return jsonSecure({ error: origin.message }, { status: origin.status });
        }
        const media = assertJsonContentType(request);
        if (!media.ok) {
          return jsonSecure({ error: media.message }, { status: media.status });
        }
        const parsed = await readJsonBody(request, TRANSLATE_MAX_BODY_BYTES);
        if (!parsed.ok) {
          return jsonSecure({ error: parsed.message }, { status: parsed.status });
        }
        const body = parsed.body as { text?: string; language?: string; shop?: string; mode?: string };
        const text = typeof body.text === "string" ? body.text.trim() : "";
        if (!text) return jsonSecure({ error: "Empty message" }, { status: 400 });
        const session = await startAiSession({ request, service: "assistant" });
        if (!session.ok) {
          return jsonSecure(gatewayErrorResponse(session), { status: session.status });
        }
        const replayed = replayDuplicateAi(session);
        if (replayed) return replayed;
        const mode = body.mode === "chat" ? "chat" : "books";

        if (mode === "books") {
          try {
            if (isXaiConfigured()) {
              const timedBooks = await runTimedProvider(
                session,
                grokJson<BooksExtract>({
                  system: BOOKS_SYSTEM,
                  user: `Shop: ${body.shop || "unknown"}\nLanguage: ${body.language || "English"}\nToday ISO: ${new Date().toISOString()}\n\nSeller said:\n${text.slice(0, 2000)}`,
                }),
              );
              if (!timedBooks.ok) {
                const timeoutBody = { error: { code: "TIMEOUT", message: "Assistant timed out." } };
                await session.saveReplay({ httpStatus: 504, body: timeoutBody });
                await session.finish({ status: "failed", errorCode: "TIMEOUT", refund: session.refundOnTimeout });
                return jsonSecure(timeoutBody, { status: 504 });
              }
              const extracted = timedBooks.value;
              const draft = grokDraft(extracted, text);
              const reply =
                extracted.reply?.trim() ||
                (draft.intent === "unknown" ? "" : summarizeDraft(draft));
              if (draft.intent !== "unknown") {
                const booksBody = { draft, reply, source: "grok" };
                await session.saveReplay({ httpStatus: 200, body: booksBody });
                await session.finish({ status: "succeeded", provider: "xai" });
                return jsonSecure(booksBody);
              }
              if (reply) {
                const replyBody = { reply, source: "grok" };
                await session.saveReplay({ httpStatus: 200, body: replyBody });
                await session.finish({ status: "succeeded", provider: "xai" });
                return jsonSecure(replyBody);
              }
            }
          } catch (err) {
            if (!(err instanceof XaiError && err.code === "NOT_CONFIGURED")) {
              /* fall through to local + chat */
            }
          }
          const draft = localDraft(text);
          if (draft.intent !== "unknown") {
            const localBody = { draft, reply: summarizeDraft(draft), source: "local" };
            await session.saveReplay({ httpStatus: 200, body: localBody });
            await session.finish({ status: "succeeded", provider: "local" });
            return jsonSecure(localBody);
          }
        }

        try {
          const timedChat = await runTimedProvider(
            session,
            tijarAssistantChat({
              text,
              language: body.language,
              shop: body.shop,
            }),
          );
          if (!timedChat.ok) {
            const timeoutBody = { error: { code: "TIMEOUT", message: "Assistant timed out." } };
            await session.saveReplay({ httpStatus: 504, body: timeoutBody });
            await session.finish({ status: "failed", errorCode: "TIMEOUT", refund: session.refundOnTimeout });
            return jsonSecure(timeoutBody, { status: 504 });
          }
          const reply = timedChat.value;
          const chatBody = { reply };
          await session.saveReplay({ httpStatus: 200, body: chatBody });
          await session.finish({ status: "succeeded", provider: session.provider });
          return jsonSecure(chatBody);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Assistant unavailable";
          const errBody = { error: message };
          await session.saveReplay({ httpStatus: 502, body: errBody });
          await session.finish({ status: "failed", errorCode: "PROVIDER_ERROR" });
          return jsonSecure(errBody, { status: 502 });
        }
      },
    },
  },
});
