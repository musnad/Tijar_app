import { newIdempotencyKey } from "@/lib/ai/idempotency";
import { aiClientHeaders } from "@/lib/ai/request-headers";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export type AiClientError = { status: number; code: string; message: string };

export async function readAiError(res: Response): Promise<AiClientError> {
  const json = (await res.json().catch(() => null)) as
    | { error?: { code?: string; message?: string } | string }
    | null;
  const raw = json?.error;
  if (typeof raw === "string") {
    return { status: res.status, code: "ERROR", message: raw };
  }
  return {
    status: res.status,
    code: raw?.code ?? (res.status === 401 ? "UNAUTHORIZED" : res.status === 402 ? "INSUFFICIENT_CREDITS" : "ERROR"),
    message:
      raw?.message ??
      (res.status === 401
        ? "Sign in to use TIJAR AI."
        : res.status === 402
          ? "Not enough TIJAR AI credits for this action."
          : `Request failed (${res.status}).`),
  };
}

/**
 * Paid AI fetch: Bearer + Idempotency-Key.
 * Same key is retried on 409 IN_PROGRESS. Failed jobs keep PRIOR_FAILED (new key = new debit).
 */
export async function aiFetch(
  path: string,
  init: RequestInit & { idempotencyKey?: string } = {},
  opts?: { maxInProgressRetries?: number },
): Promise<Response> {
  const key = init.idempotencyKey?.trim() || newIdempotencyKey();
  const { idempotencyKey: _ignored, headers, ...rest } = init;
  const max = opts?.maxInProgressRetries ?? 5;
  let last: Response | undefined;
  for (let attempt = 0; attempt <= max; attempt += 1) {
    last = await fetch(path, {
      ...rest,
      headers: await aiClientHeaders(headers, key),
    });
    if (last.status !== 409) return last;
    const peek = (await last.clone().json().catch(() => null)) as { error?: { code?: string } } | null;
    if (peek?.error?.code === "IN_PROGRESS" && attempt < max) {
      await sleep(400 * (attempt + 1));
      continue;
    }
    return last;
  }
  return last!;
}
