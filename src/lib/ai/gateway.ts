import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { memoryAiLedger, type DebitResult } from "@/lib/ai/credits";
import { readIdempotencyKey } from "@/lib/ai/idempotency";
import { providerModelHint, selectAiProvider } from "@/lib/ai/providers";
import { parseStoredReplay, type AiReplayPayload } from "@/lib/ai/replay";
import { mapCreditRpcError } from "@/lib/ai/rpc-errors";
import {
  DEFAULT_AI_SERVICES,
  type AiProvider,
  type AiServiceSlug,
} from "@/lib/ai/services";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { clientIp, requireAuthenticatedUser, resolveTranslateRateKey } from "@/lib/api/security";
import { readSupabasePublicEnv } from "@/lib/supabase/runtime-env";

export type AiGatewayError = {
  ok: false;
  status: number;
  code: string;
  message: string;
};

export type AiJobStatus = "succeeded" | "failed" | "refunded";

export type AiSession = {
  ok: true;
  jobId: string;
  profileId: string | null;
  authUserId: string | null;
  service: AiServiceSlug;
  provider: AiProvider;
  model: string;
  creditsCharged: number;
  debitTxnId: string | null;
  skippedCredits: boolean;
  duplicate: boolean;
  providerRequestId: string | null;
  jobStatus: "pending" | "running" | AiJobStatus | null;
  storedResult: AiReplayPayload | null;
  timeoutMs: number;
  refundOnTimeout: boolean;
  rememberProviderRef: (ref: string) => Promise<void>;
  saveReplay: (payload: AiReplayPayload) => Promise<void>;
  finish: (input: {
    status: AiJobStatus;
    provider?: AiProvider;
    model?: string;
    errorCode?: string;
    refund?: boolean;
  }) => Promise<void>;
};

export type RpcDebitFn = (input: {
  service: AiServiceSlug;
  jobId: string;
  idempotencyKey: string;
  businessId: string | null;
}) => Promise<DebitResult | AiGatewayError>;

export type StartAiSessionInput = {
  request: Request;
  service: AiServiceSlug;
  businessId?: string | null;
  idempotencyKey?: string | null;
  /** When set, skip JWT lookup (tests). */
  authUserId?: string | null;
  /** Test-only in-memory ledger. Does not call Postgres. */
  ledger?: typeof memoryAiLedger;
  /** Test-only fail-closed RPC stub (missing schema, NO_PROFILE, etc.). */
  rpcDebit?: RpcDebitFn;
};

function jobId(): string {
  return crypto.randomUUID();
}

function ipHash(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

function userClient(request: Request) {
  const env = readSupabasePublicEnv();
  if (!env) return null;
  const auth = request.headers.get("authorization") ?? "";
  return createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: auth.startsWith("Bearer ") ? { headers: { Authorization: auth } } : undefined,
  });
}

type DebitOkStatus = NonNullable<Extract<DebitResult, { ok: true }>["status"]>;

type DebitRow = {
  charged?: boolean;
  duplicate?: boolean;
  balance?: number;
  txn_id?: string;
  job_id?: string;
  credits?: number;
  provider_request_id?: string | null;
  status?: string;
  result?: unknown;
  error_code?: string | null;
};

async function debitViaRpc(
  request: Request,
  input: {
    service: AiServiceSlug;
    jobId: string;
    idempotencyKey: string;
    businessId: string | null;
  },
): Promise<DebitResult | AiGatewayError> {
  const supabase = userClient(request);
  if (!supabase) {
    return {
      ok: false,
      status: 503,
      code: "CREDITS_UNAVAILABLE",
      message: "TIJAR AI billing is not configured.",
    };
  }
  const { data, error } = await supabase.rpc("debit_ai_credits", {
    p_service: input.service,
    p_job_id: input.jobId,
    p_idempotency_key: input.idempotencyKey,
    p_business_id: input.businessId,
  });
  if (error) return mapCreditRpcError(error);
  const row = (Array.isArray(data) ? data[0] : data) as DebitRow | null;
  if (!row) {
    return { ok: false, status: 503, code: "CREDITS_ERROR", message: "Could not authorise AI credits. Try again." };
  }
  return {
    ok: true,
    charged: Boolean(row.charged),
    balance: Number(row.balance ?? 0),
    txnId: String(row.txn_id ?? ""),
    duplicate: Boolean(row.duplicate),
    jobId: row.job_id ? String(row.job_id) : input.jobId,
    credits: Number(row.credits ?? 0),
    providerRequestId: row.provider_request_id ? String(row.provider_request_id) : null,
    status: (row.status as DebitOkStatus) ?? "running",
    result: parseStoredReplay(row.result),
    errorCode: row.error_code ?? null,
  };
}

async function refundViaRpc(request: Request, debitTxnId: string, jobIdValue: string): Promise<void> {
  const supabase = userClient(request);
  if (!supabase || !debitTxnId) return;
  await supabase.rpc("refund_ai_credits", { p_debit_txn_id: debitTxnId, p_job_id: jobIdValue });
}

async function completeViaRpc(
  request: Request,
  input: {
    jobId: string;
    status: AiJobStatus;
    provider: string;
    model: string;
    durationMs: number;
    errorCode?: string;
    ipHashValue: string;
  },
): Promise<void> {
  const supabase = userClient(request);
  if (!supabase) return;
  await supabase.rpc("complete_ai_job", {
    p_job_id: input.jobId,
    p_status: input.status,
    p_provider: input.provider,
    p_model: input.model,
    p_duration_ms: input.durationMs,
    p_error_code: input.errorCode ?? null,
    p_ip_hash: input.ipHashValue,
  });
}

export async function startAiSession(input: StartAiSessionInput): Promise<AiSession | AiGatewayError> {
  const config = DEFAULT_AI_SERVICES[input.service];
  const ip = clientIp(input.request);
  const resolved = input.authUserId
    ? { userId: input.authUserId, authenticated: true, rateLimitKey: `user:${input.authUserId}` }
    : await resolveTranslateRateKey(input.request);
  const { userId, authenticated, rateLimitKey } = resolved;

  if (!authenticated) {
    if (input.authUserId) {
      /* tests pass authUserId */
    } else {
      const auth = await requireAuthenticatedUser(input.request);
      if (!auth.ok) {
        return { ok: false, status: auth.status, code: auth.code, message: auth.message };
      }
    }
  }

  const idempotencyKey = readIdempotencyKey(input.request, input.idempotencyKey);
  if (!idempotencyKey) {
    return {
      ok: false,
      status: 400,
      code: "IDEMPOTENCY_REQUIRED",
      message: "Send an Idempotency-Key for this AI action.",
    };
  }

  const limit = checkRateLimit(`ai:${input.service}:${rateLimitKey}`, config.rateLimitPerMin, 60_000);
  if (!limit.allowed) {
    return {
      ok: false,
      status: 429,
      code: "RATE_LIMITED",
      message: `Too many ${config.displayName} requests. Try again in ${limit.retryAfterSeconds}s.`,
    };
  }

  const generatedJobId = jobId();
  const provider = selectAiProvider(input.service);
  const model = providerModelHint(provider, input.service);
  const started = Date.now();
  const actorId = userId ?? input.authUserId;
  if (!actorId) {
    return { ok: false, status: 401, code: "UNAUTHORIZED", message: "Sign in to use TIJAR AI." };
  }

  let debitTxnId: string | null = null;
  let creditsCharged = 0;
  let duplicate = false;
  let resolvedJobId = generatedJobId;
  let providerRequestId: string | null = null;
  let jobStatus: AiSession["jobStatus"] = "running";
  let storedResult: AiReplayPayload | null = null;

  if (input.ledger) {
    const debit = await input.ledger.debit({
      profileId: actorId,
      amount: config.creditCost,
      jobId: generatedJobId,
      idempotencyKey,
    });
    if (!debit.ok) {
      if (debit.code === "INSUFFICIENT_CREDITS") {
        return {
          ok: false,
          status: 402,
          code: "INSUFFICIENT_CREDITS",
          message: "Not enough TIJAR AI credits for this action.",
        };
      }
      return { ok: false, status: 400, code: debit.code, message: "Could not charge AI credits." };
    }
    debitTxnId = debit.txnId;
    creditsCharged = debit.charged ? config.creditCost : 0;
    duplicate = debit.duplicate;
    resolvedJobId = debit.jobId ?? generatedJobId;
    providerRequestId = debit.providerRequestId ?? null;
    jobStatus = debit.status ?? "running";
    storedResult = debit.result ?? null;
  } else {
    const debitFn = input.rpcDebit ?? debitViaRpc.bind(null, input.request);
    const debit = await debitFn({
      service: input.service,
      jobId: generatedJobId,
      idempotencyKey,
      businessId: input.businessId ?? null,
    });
    if (!debit.ok) {
      if ("status" in debit) return debit;
      if (debit.code === "INSUFFICIENT_CREDITS") {
        return {
          ok: false,
          status: 402,
          code: "INSUFFICIENT_CREDITS",
          message: "Not enough TIJAR AI credits for this action.",
        };
      }
      return { ok: false, status: 503, code: "CREDITS_ERROR", message: "Could not authorise AI credits. Try again." };
    }
    debitTxnId = debit.txnId;
    duplicate = debit.duplicate;
    creditsCharged = debit.charged ? Number("credits" in debit ? debit.credits ?? config.creditCost : config.creditCost) : 0;
    if ("jobId" in debit && debit.jobId) resolvedJobId = debit.jobId;
    if ("providerRequestId" in debit) providerRequestId = debit.providerRequestId ?? null;
    if ("status" in debit && debit.status) jobStatus = debit.status;
    if ("result" in debit) storedResult = debit.result ?? null;
    if (debit.charged) creditsCharged = Number(("credits" in debit && debit.credits) || config.creditCost);
    if (!debit.charged) creditsCharged = 0;
  }

  const finish = async (result: {
    status: AiJobStatus;
    provider?: AiProvider;
    model?: string;
    errorCode?: string;
    refund?: boolean;
  }) => {
    const durationMs = Date.now() - started;
    const usedProvider = result.provider ?? provider;
    const usedModel = result.model ?? model;
    const shouldRefund = result.status === "failed" && result.refund !== false && Boolean(debitTxnId);
    if (shouldRefund) {
      if (input.ledger) {
        await input.ledger.refund({ profileId: actorId, debitTxnId: debitTxnId!, jobId: resolvedJobId });
      } else {
        await refundViaRpc(input.request, debitTxnId!, resolvedJobId);
      }
      result = { ...result, status: "refunded" };
    }
    jobStatus = result.status;
    if (input.ledger) {
      input.ledger.setJobStatus(actorId, idempotencyKey, result.status, { errorCode: result.errorCode ?? null });
    }
    if (!input.ledger && !input.rpcDebit) {
      await completeViaRpc(input.request, {
        jobId: resolvedJobId,
        status: result.status,
        provider: usedProvider,
        model: usedModel,
        durationMs,
        errorCode: result.errorCode,
        ipHashValue: ipHash(ip),
      });
    }
  };

  const rememberProviderRef = async (ref: string) => {
    providerRequestId = ref;
    if (input.ledger) {
      input.ledger.setJobStatus(actorId, idempotencyKey, jobStatus ?? "running", { providerRequestId: ref });
      return;
    }
    if (input.rpcDebit) return;
    const supabase = userClient(input.request);
    if (!supabase) return;
    await supabase.rpc("set_ai_job_provider_ref", { p_job_id: resolvedJobId, p_ref: ref });
  };

  const saveReplay = async (payload: AiReplayPayload) => {
    storedResult = storedResult ?? payload;
    if (input.ledger) {
      input.ledger.saveJobResult(actorId, idempotencyKey, payload);
      return;
    }
    if (input.rpcDebit) return;
    const supabase = userClient(input.request);
    if (!supabase) return;
    await supabase.rpc("save_ai_job_result", { p_job_id: resolvedJobId, p_result: payload });
  };

  return {
    ok: true,
    jobId: resolvedJobId,
    profileId: null,
    authUserId: actorId,
    service: input.service,
    provider,
    model,
    creditsCharged,
    debitTxnId,
    skippedCredits: false,
    duplicate,
    providerRequestId,
    jobStatus,
    storedResult,
    timeoutMs: config.timeoutMs,
    refundOnTimeout: config.refundOnTimeout,
    rememberProviderRef,
    saveReplay,
    finish,
  };
}

export { replayDuplicateAi, interpretDuplicateSession } from "@/lib/ai/replay";
export type { AiReplayPayload } from "@/lib/ai/replay";

export function gatewayErrorResponse(err: AiGatewayError): { error: { code: string; message: string } } {
  return { error: { code: err.code, message: err.message } };
}

export function withAiTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error("TIJAR AI timed out.") as Error & { code: string };
      err.code = "TIMEOUT";
      reject(err);
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export async function runTimedProvider<T>(
  session: AiSession,
  work: Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; timeout: true }> {
  try {
    const value = await withAiTimeout(work, session.timeoutMs);
    return { ok: true, value };
  } catch (err) {
    const timeout = Boolean(err && typeof err === "object" && "code" in err && (err as { code: string }).code === "TIMEOUT");
    if (timeout) return { ok: false, timeout: true };
    throw err;
  }
}
