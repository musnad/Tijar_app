import { describe, expect, it } from "vitest";

import { AiCreditLedger } from "@/lib/ai/credits";
import { sniffAudioSignature, guardVoiceEnrollmentAudio } from "@/lib/ai/audio-guard";
import { startAiSession, withAiTimeout } from "@/lib/ai/gateway";
import { ownsAiVideoRequest, ownsAiVoice } from "@/lib/ai/ownership";
import { mapCreditRpcError } from "@/lib/ai/rpc-errors";
import { clearRateLimits } from "@/lib/api/rate-limit";

function request(headers?: Record<string, string>): Request {
  return new Request("https://www.tijar.ng/api/ai/listing", {
    method: "POST",
    headers: { "idempotency-key": "test-key-01", ...(headers ?? {}) },
  });
}

describe("AI credit ledger", () => {
  it("debits successfully and never goes negative", async () => {
    const ledger = new AiCreditLedger(10);
    const first = await ledger.debit({ profileId: "p1", amount: 4, jobId: "j1", idempotencyKey: "k1" });
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.charged).toBe(true);
      expect(first.balance).toBe(6);
    }
    const denied = await ledger.debit({ profileId: "p1", amount: 7, jobId: "j2", idempotencyKey: "k2" });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.code).toBe("INSUFFICIENT_CREDITS");
    expect(ledger.ensure("p1").balance).toBe(6);
  });

  it("treats duplicate idempotency keys as a single debit", async () => {
    const ledger = new AiCreditLedger(20);
    const a = await ledger.debit({ profileId: "p1", amount: 5, jobId: "j1", idempotencyKey: "same" });
    const b = await ledger.debit({ profileId: "p1", amount: 5, jobId: "j2", idempotencyKey: "same" });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(b.duplicate).toBe(true);
      expect(b.charged).toBe(false);
      expect(b.txnId).toBe(a.txnId);
    }
    expect(ledger.ensure("p1").balance).toBe(15);
  });

  it("serializes concurrent duplicate keys as one debit", async () => {
    const ledger = new AiCreditLedger(20);
    const results = await Promise.all(
      [1, 2, 3].map((n) =>
        ledger.debit({ profileId: "p1", amount: 5, jobId: `j${n}`, idempotencyKey: "same-conc" }),
      ),
    );
    const charged = results.filter((r) => r.ok && r.charged);
    expect(charged).toHaveLength(1);
    expect(ledger.ensure("p1").balance).toBe(15);
  });

  it("refunds a debit once", async () => {
    const ledger = new AiCreditLedger(8);
    const debit = await ledger.debit({ profileId: "p1", amount: 3, jobId: "j1", idempotencyKey: "k1" });
    expect(debit.ok).toBe(true);
    if (!debit.ok) return;
    const first = await ledger.refund({ profileId: "p1", debitTxnId: debit.txnId, jobId: "j1" });
    const second = await ledger.refund({ profileId: "p1", debitTxnId: debit.txnId, jobId: "j1" });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(ledger.ensure("p1").balance).toBe(8);
  });
});

describe("AI gateway fail-closed", () => {
  it("rejects guest requests before any debit", async () => {
    const result = await startAiSession({ request: request(), service: "translate" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
      expect(result.code).toBe("UNAUTHORIZED");
    }
  });

  it("rejects missing idempotency key", async () => {
    const result = await startAiSession({
      request: new Request("https://www.tijar.ng/api/ai/listing", { method: "POST" }),
      service: "listing",
      authUserId: "user-1",
      ledger: new AiCreditLedger(100),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("IDEMPOTENCY_REQUIRED");
      expect(result.status).toBe(400);
    }
  });

  it("maps missing schema to 503", () => {
    const err = mapCreditRpcError({ code: "42P01", message: "relation ai_wallets does not exist" });
    expect(err.status).toBe(503);
    expect(err.code).toBe("CREDITS_UNAVAILABLE");
  });

  it("maps missing RPC to 503", () => {
    const err = mapCreditRpcError({ code: "42883", message: "function debit_ai_credits does not exist" });
    expect(err.status).toBe(503);
  });

  it("maps NO_PROFILE to 401", () => {
    const err = mapCreditRpcError({ message: "NO_PROFILE" });
    expect(err.status).toBe(401);
    expect(err.code).toBe("NO_PROFILE");
  });

  it("maps unexpected RPC errors to 503 and never skips", () => {
    const err = mapCreditRpcError({ message: "connection reset" });
    expect(err.status).toBe(503);
    expect(err.code).toBe("CREDITS_ERROR");
  });

  it("returns 503 from startAiSession when RPC reports missing tables", async () => {
    const result = await startAiSession({
      request: request(),
      service: "listing",
      authUserId: "user-1",
      rpcDebit: async () => mapCreditRpcError({ code: "42P01", message: "does not exist" }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(503);
  });

  it("returns 401 from startAiSession on NO_PROFILE", async () => {
    const result = await startAiSession({
      request: request(),
      service: "listing",
      authUserId: "user-1",
      rpcDebit: async () => mapCreditRpcError({ message: "NO_PROFILE" }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it("debits through the gateway and refunds provider failure", async () => {
    const ledger = new AiCreditLedger(10);
    const session = await startAiSession({
      request: request(),
      service: "listing",
      authUserId: "user-1",
      ledger,
      idempotencyKey: "job-a-xx",
    });
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    expect(session.creditsCharged).toBe(2);
    expect(ledger.ensure("user-1").balance).toBe(8);
    await session.finish({ status: "failed", errorCode: "PROVIDER_ERROR" });
    expect(ledger.ensure("user-1").balance).toBe(10);
  });

  it("does not refund video-style timeouts when asked", async () => {
    const ledger = new AiCreditLedger(400);
    const session = await startAiSession({
      request: request(),
      service: "video",
      authUserId: "user-vid",
      ledger,
      idempotencyKey: "video-timeout-1",
    });
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    expect(session.refundOnTimeout).toBe(false);
    await session.finish({ status: "failed", errorCode: "TIMEOUT", refund: false });
    expect(ledger.ensure("user-vid").balance).toBe(200);
  });

  it("treats duplicate video keys as one debit", async () => {
    const ledger = new AiCreditLedger(500);
    const a = await startAiSession({
      request: request(),
      service: "video",
      authUserId: "user-dup",
      ledger,
      idempotencyKey: "video-dup-key-1",
    });
    const b = await startAiSession({
      request: request(),
      service: "video",
      authUserId: "user-dup",
      ledger,
      idempotencyKey: "video-dup-key-1",
    });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(b.duplicate).toBe(true);
      expect(b.creditsCharged).toBe(0);
    }
    expect(ledger.ensure("user-dup").balance).toBe(300);
  });

  it("rate-limits repeated gateway calls", async () => {
    clearRateLimits();
    const ledger = new AiCreditLedger(1000);
    const attempts = [];
    for (let i = 0; i < 5; i += 1) {
      attempts.push(
        startAiSession({
          request: request(),
          service: "video",
          authUserId: "user-rl",
          ledger,
          idempotencyKey: `video-rl-${i}`,
        }),
      );
    }
    const results = await Promise.all(attempts);
    expect(results.filter((r) => r.ok)).toHaveLength(4);
    expect(results.some((r) => !r.ok && r.code === "RATE_LIMITED")).toBe(true);
  });

  it("times out slow work", async () => {
    await expect(withAiTimeout(new Promise(() => undefined), 10)).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("returns insufficient credits through the gateway", async () => {
    const ledger = new AiCreditLedger(1);
    const session = await startAiSession({
      request: request(),
      service: "listing",
      authUserId: "user-poor",
      ledger,
      idempotencyKey: "poor-key-1",
    });
    expect(session.ok).toBe(false);
    if (!session.ok) {
      expect(session.code).toBe("INSUFFICIENT_CREDITS");
      expect(session.status).toBe(402);
    }
    expect(ledger.ensure("user-poor").balance).toBe(1);
  });
});

describe("voice enrolment guards", () => {
  it("rejects oversized audio", async () => {
    const blob = new Blob([new Uint8Array(3 * 1024 * 1024 + 10)], { type: "audio/webm" });
    const result = await guardVoiceEnrollmentAudio(blob);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("AUDIO_TOO_LARGE");
  });

  it("rejects unknown signatures", async () => {
    expect(sniffAudioSignature(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]))).toBeNull();
  });

  it("sniffs webm", () => {
    expect(sniffAudioSignature(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]))).toBe("audio/webm");
  });
});

describe("ownership fail-closed", () => {
  it("denies video poll without a session", async () => {
    expect(await ownsAiVideoRequest(new Request("https://www.tijar.ng/api/studio/video/x"), "req-1")).toBe(false);
  });

  it("denies unbound voice ids", async () => {
    expect(await ownsAiVoice(new Request("https://www.tijar.ng/api/speak"), "voice-xyz")).toBe(false);
  });
});
