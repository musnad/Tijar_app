import { jsonSecure } from "@/lib/api/security";

/**
 * Retry policy (same Idempotency-Key = same intentional operation):
 * - succeeded + stored payload → replay, never call the provider
 * - running / pending → 409 IN_PROGRESS
 * - failed / refunded → 409 PRIOR_FAILED; client must send a new Idempotency-Key (new debit)
 * - succeeded without stored payload (except video request id) → 409 RESULT_UNAVAILABLE
 */
export type AiReplayPayload = {
  httpStatus: number;
  body?: unknown;
  headers?: Record<string, string>;
  audioBase64?: string;
  contentType?: string;
};

export type DuplicateDecision =
  | { action: "continue" }
  | { action: "replay"; payload: AiReplayPayload }
  | { action: "in_progress" }
  | { action: "prior_failed"; payload: AiReplayPayload }
  | { action: "unavailable" };

export type ReplaySessionView = {
  duplicate: boolean;
  jobStatus: "succeeded" | "failed" | "refunded" | "pending" | "running" | null;
  storedResult: AiReplayPayload | null;
  providerRequestId: string | null;
};

export function interpretDuplicateSession(session: ReplaySessionView): DuplicateDecision {
  if (!session.duplicate) return { action: "continue" };

  const status = session.jobStatus;
  const stored = session.storedResult;

  if (status === "succeeded") {
    if (stored && (stored.body !== undefined || stored.audioBase64)) {
      return { action: "replay", payload: stored };
    }
    if (session.providerRequestId) {
      return {
        action: "replay",
        payload: {
          httpStatus: 200,
          body: { fallback: false, grok: true, requestId: session.providerRequestId, replay: true },
        },
      };
    }
    return { action: "unavailable" };
  }

  if (status === "failed" || status === "refunded") {
    return {
      action: "prior_failed",
      payload: stored ?? {
        httpStatus: 409,
        body: {
          error: {
            code: "PRIOR_FAILED",
            message: "This AI action already failed. Send a new Idempotency-Key to try again.",
          },
        },
      },
    };
  }

  return { action: "in_progress" };
}

function asReplayJson(payload: AiReplayPayload, extra?: Record<string, unknown>): Response {
  if (payload.audioBase64 && payload.contentType) {
    const bytes = Uint8Array.from(atob(payload.audioBase64), (c) => c.charCodeAt(0));
    return new Response(bytes, {
      status: payload.httpStatus || 200,
      headers: {
        "Content-Type": payload.contentType,
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        "X-Content-Type-Options": "nosniff",
        ...(payload.headers ?? {}),
      },
    });
  }
  const body =
    payload.body && typeof payload.body === "object" && !Array.isArray(payload.body)
      ? { ...(payload.body as Record<string, unknown>), ...extra }
      : payload.body;
  return jsonSecure(body, { status: payload.httpStatus || 200, headers: payload.headers });
}

/** Returns a response when the provider must not run. Null means continue. */
export function replayDuplicateAi(session: ReplaySessionView): Response | null {
  const decision = interpretDuplicateSession(session);
  if (decision.action === "continue") return null;
  if (decision.action === "replay") return asReplayJson(decision.payload, { replay: true });
  if (decision.action === "in_progress") {
    return jsonSecure(
      {
        error: {
          code: "IN_PROGRESS",
          message: "That AI request is still running. Wait a moment.",
        },
      },
      { status: 409 },
    );
  }
  if (decision.action === "unavailable") {
    return jsonSecure(
      {
        error: {
          code: "RESULT_UNAVAILABLE",
          message: "That AI request already finished but the payload was not stored. Send a new Idempotency-Key.",
        },
      },
      { status: 409 },
    );
  }
  const status = decision.payload.httpStatus && decision.payload.httpStatus >= 400 ? decision.payload.httpStatus : 409;
  return asReplayJson({ ...decision.payload, httpStatus: status });
}

export function parseStoredReplay(value: unknown): AiReplayPayload | null {
  if (!value || typeof value !== "object") return null;
  const row = value as AiReplayPayload;
  if (typeof row.httpStatus !== "number") return null;
  return row;
}
