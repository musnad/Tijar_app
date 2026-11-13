import type { AiReplayPayload } from "@/lib/ai/replay";
import { DEFAULT_AI_CREDIT_GRANT } from "@/lib/ai/services";

export type CreditReason = "debit" | "grant" | "refund" | "reversal" | "admin";

export type CreditTxn = {
  id: string;
  profileId: string;
  jobId: string | null;
  delta: number;
  reason: CreditReason;
  idempotencyKey: string | null;
};

export type CreditWallet = {
  profileId: string;
  balance: number;
};

export type DebitInput = {
  profileId: string;
  amount: number;
  jobId: string;
  idempotencyKey: string;
};

export type LedgerJob = {
  jobId: string;
  status: "pending" | "running" | "succeeded" | "failed" | "refunded";
  result: AiReplayPayload | null;
  providerRequestId: string | null;
  errorCode?: string | null;
};

export type DebitOk = {
  ok: true;
  charged: boolean;
  balance: number;
  txnId: string;
  duplicate: boolean;
  jobId?: string;
  credits?: number;
  providerRequestId?: string | null;
  status?: LedgerJob["status"];
  result?: AiReplayPayload | null;
  errorCode?: string | null;
};

export type DebitFail = {
  ok: false;
  code: "INSUFFICIENT_CREDITS" | "INVALID_AMOUNT" | "INVALID_PROFILE";
  balance: number;
};

export type DebitResult = DebitOk | DebitFail;

function newId(): string {
  return `txn_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
}

/** In-memory ledger used in tests and as a last-resort fallback. SQL RPC is authoritative in production. */
export class AiCreditLedger {
  wallets = new Map<string, CreditWallet>();
  txns: CreditTxn[] = [];
  jobs = new Map<string, LedgerJob>();
  private locks = new Map<string, Promise<void>>();
  grantOnCreate: number;

  constructor(grantOnCreate = DEFAULT_AI_CREDIT_GRANT) {
    this.grantOnCreate = grantOnCreate;
  }

  ensure(profileId: string): CreditWallet {
    let wallet = this.wallets.get(profileId);
    if (!wallet) {
      wallet = { profileId, balance: Math.max(0, this.grantOnCreate) };
      this.wallets.set(profileId, wallet);
      if (this.grantOnCreate > 0) {
        this.txns.push({
          id: newId(),
          profileId,
          jobId: null,
          delta: this.grantOnCreate,
          reason: "grant",
          idempotencyKey: `grant:${profileId}`,
        });
      }
    }
    return wallet;
  }

  private async withLock<T>(profileId: string, fn: () => T | Promise<T>): Promise<T> {
    const prev = this.locks.get(profileId) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(
      profileId,
      prev.then(() => next),
    );
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  debit(input: DebitInput): Promise<DebitResult> {
    return this.withLock(input.profileId, () => this.debitLocked(input));
  }

  private debitLocked(input: DebitInput): DebitResult {
    if (!input.profileId) return { ok: false, code: "INVALID_PROFILE", balance: 0 };
    if (!Number.isInteger(input.amount) || input.amount < 0) {
      return { ok: false, code: "INVALID_AMOUNT", balance: this.wallets.get(input.profileId)?.balance ?? 0 };
    }
    const wallet = this.ensure(input.profileId);
    const existing = this.txns.find(
      (t) => t.profileId === input.profileId && t.idempotencyKey === input.idempotencyKey && t.reason === "debit",
    );
    if (existing) {
      const job = this.jobs.get(this.jobKey(input.profileId, input.idempotencyKey));
      return {
        ok: true,
        charged: false,
        balance: wallet.balance,
        txnId: existing.id,
        duplicate: true,
        jobId: job?.jobId ?? existing.jobId ?? input.jobId,
        providerRequestId: job?.providerRequestId ?? null,
        status: job?.status ?? "running",
        result: job?.result ?? null,
        errorCode: job?.errorCode ?? null,
      };
    }
    if (input.amount === 0) {
      const txn: CreditTxn = {
        id: newId(),
        profileId: input.profileId,
        jobId: input.jobId,
        delta: 0,
        reason: "debit",
        idempotencyKey: input.idempotencyKey,
      };
      this.txns.push(txn);
      this.jobs.set(this.jobKey(input.profileId, input.idempotencyKey), {
        jobId: input.jobId,
        status: "running",
        result: null,
        providerRequestId: null,
      });
      return { ok: true, charged: false, balance: wallet.balance, txnId: txn.id, duplicate: false, jobId: input.jobId, status: "running" };
    }
    if (wallet.balance < input.amount) {
      return { ok: false, code: "INSUFFICIENT_CREDITS", balance: wallet.balance };
    }
    wallet.balance -= input.amount;
    const txn: CreditTxn = {
      id: newId(),
      profileId: input.profileId,
      jobId: input.jobId,
      delta: -input.amount,
      reason: "debit",
      idempotencyKey: input.idempotencyKey,
    };
    this.txns.push(txn);
    this.jobs.set(this.jobKey(input.profileId, input.idempotencyKey), {
      jobId: input.jobId,
      status: "running",
      result: null,
      providerRequestId: null,
    });
    return { ok: true, charged: true, balance: wallet.balance, txnId: txn.id, duplicate: false, jobId: input.jobId, status: "running" };
  }

  private jobKey(profileId: string, idempotencyKey: string): string {
    return `${profileId}::${idempotencyKey}`;
  }

  saveJobResult(profileId: string, idempotencyKey: string, result: AiReplayPayload): void {
    const job = this.jobs.get(this.jobKey(profileId, idempotencyKey));
    if (job && !job.result) job.result = result;
  }

  setJobStatus(
    profileId: string,
    idempotencyKey: string,
    status: LedgerJob["status"],
    extra?: { providerRequestId?: string | null; errorCode?: string | null },
  ): void {
    const job = this.jobs.get(this.jobKey(profileId, idempotencyKey));
    if (!job) return;
    job.status = status;
    if (extra?.providerRequestId) job.providerRequestId = extra.providerRequestId;
    if (extra?.errorCode !== undefined) job.errorCode = extra.errorCode;
  }

  refund(input: { profileId: string; debitTxnId: string; jobId: string }): Promise<{ ok: boolean; balance: number }> {
    return this.withLock(input.profileId, () => {
      const debit = this.txns.find((t) => t.id === input.debitTxnId && t.reason === "debit");
      if (!debit || debit.delta >= 0) return { ok: false, balance: this.ensure(input.profileId).balance };
      const already = this.txns.find(
        (t) => t.profileId === input.profileId && t.idempotencyKey === `refund:${input.debitTxnId}`,
      );
      const wallet = this.ensure(input.profileId);
      if (already) return { ok: true, balance: wallet.balance };
      const amount = Math.abs(debit.delta);
      wallet.balance += amount;
      this.txns.push({
        id: newId(),
        profileId: input.profileId,
        jobId: input.jobId,
        delta: amount,
        reason: "refund",
        idempotencyKey: `refund:${input.debitTxnId}`,
      });
      return { ok: true, balance: wallet.balance };
    });
  }
}

export const memoryAiLedger = new AiCreditLedger();
