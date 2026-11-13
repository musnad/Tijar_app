import { aiFetch, readAiError } from "@/lib/ai/client-fetch";

export type TranslateUiResult =
  | { ok: true; translatedText: string; cached: boolean }
  | { ok: false; code: string; message: string };

/** Client -> POST /api/translate. Attaches the Supabase session when present. */
export async function translateTextClient(input: {
  text: string;
  fromLanguage: string;
  toLanguage: string;
}): Promise<TranslateUiResult> {
  let res: Response;
  try {
    res = await aiFetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    return { ok: false, code: "NETWORK", message: "Could not reach translation. Check your connection." };
  }

  const body = (await res.json().catch(() => null)) as
    | { translatedText?: string; cached?: boolean; error?: { code: string; message: string } }
    | null;

  if (!res.ok || !body?.translatedText) {
    if (!body?.error && res.ok === false) {
      const fallback = await readAiError(new Response(JSON.stringify(body), { status: res.status }));
      return { ok: false, code: fallback.code, message: fallback.message };
    }
    return {
      ok: false,
      code: body?.error?.code ?? (res.status === 401 ? "UNAUTHORIZED" : "PROVIDER_ERROR"),
      message: body?.error?.message ?? (res.status === 401 ? "Sign in to use TIJAR AI." : "Translation failed. Please try again."),
    };
  }
  return { ok: true, translatedText: body.translatedText, cached: Boolean(body.cached) };
}
