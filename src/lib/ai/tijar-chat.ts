import { openaiChat } from "@/lib/openai/client";
import { grokChat, isXaiConfigured } from "@/lib/xai/client";

const SYSTEM =
  "You are TIJAR, a concise bookkeeping assistant for Nigerian small businesses. Help with sales, expenses, stock, and customers. Never invent payments. Reply in the user's language when obvious. Keep answers under 80 words.";

/** Grok first, ChatGPT if Grok is missing or fails. */
export async function tijarAssistantChat(input: { text: string; language?: string; shop?: string }): Promise<string> {
  const user = `Shop: ${input.shop || "unknown"}\nLanguage: ${input.language || "English"}\n\n${input.text}`;
  if (isXaiConfigured()) {
    try {
      return await grokChat({ system: SYSTEM, user });
    } catch {
      /* ChatGPT fallback */
    }
  }
  return openaiChat({ system: SYSTEM, user });
}
