import { describe, expect, it, vi } from "vitest";

import { AiCreditLedger } from "@/lib/ai/credits";
import { replayDuplicateAi, startAiSession } from "@/lib/ai/gateway";
import { interpretDuplicateSession } from "@/lib/ai/replay";
import { evaluateCustomVoiceAccess, requireVoiceCloneProvider } from "@/lib/ai/voice-access";
import { clearRateLimits } from "@/lib/api/rate-limit";

function request(): Request {
  return new Request("https://www.tijar.ng/api/translate", {
    method: "POST",
    headers: { "idempotency-key": "phase22-key" },
  });
}

async function runWithProvider(
  service: "translate" | "tts" | "graphics" | "video" | "search_image",
  ledger: AiCreditLedger,
  key: string,
  provider: () => Promise<unknown>,
  user = "user-p22",
) {
  const session = await startAiSession({
    request: request(),
    service,
    authUserId: user,
    ledger,
    idempotencyKey: key,
  });
  if (!session.ok) return { session, replayed: null as Response | null, called: false };
  const replayed = replayDuplicateAi(session);
  if (replayed) return { session, replayed, called: false };
  const value = await provider();
  if (service === "video") {
    await session.rememberProviderRef("grok-req-replay-1");
    await session.saveReplay({
      httpStatus: 200,
      body: { fallback: false, grok: true, requestId: "grok-req-replay-1" },
    });
  } else {
    await session.saveReplay({ httpStatus: 200, body: { ok: true, value } });
  }
  await session.finish({ status: "succeeded" });
  return { session, replayed: null, called: true };
}

describe("Phase 2.2 duplicate provider protection", () => {
  it("does not call translate provider twice and replays the stored result", async () => {
    clearRateLimits();
    const ledger = new AiCreditLedger(50);
    const provider = vi.fn(async () => ({ translatedText: "sannu" }));
    const first = await runWithProvider("translate", ledger, "tr-dup-1", provider);
    const second = await runWithProvider("translate", ledger, "tr-dup-1", provider);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(first.called).toBe(true);
    expect(second.replayed?.status).toBe(200);
    const body = await second.replayed!.json();
    expect(body.replay).toBe(true);
    expect(body.value.translatedText).toBe("sannu");
    expect(ledger.txns.filter((t) => t.reason === "debit")).toHaveLength(1);
  });

  it("does not call TTS provider twice", async () => {
    clearRateLimits();
    const ledger = new AiCreditLedger(50);
    const provider = vi.fn(async () => ({ bytes: new Uint8Array([1, 2]) }));
    await runWithProvider("tts", ledger, "tts-dup-1", provider);
    const second = await runWithProvider("tts", ledger, "tts-dup-1", provider);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(second.replayed?.status).toBe(200);
  });

  it("does not call image provider twice", async () => {
    clearRateLimits();
    const ledger = new AiCreditLedger(200);
    const provider = vi.fn(async () => ({ dataUrl: "data:image/png;base64,xx" }));
    await runWithProvider("graphics", ledger, "img-dup-1", provider);
    const second = await runWithProvider("graphics", ledger, "img-dup-1", provider);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(second.called).toBe(false);
  });

  it("does not start a second video provider job", async () => {
    clearRateLimits();
    const ledger = new AiCreditLedger(500);
    const provider = vi.fn(async () => ({ requestId: "grok-req-replay-1" }));
    await runWithProvider("video", ledger, "vid-dup-1", provider);
    const second = await runWithProvider("video", ledger, "vid-dup-1", provider);
    expect(provider).toHaveBeenCalledTimes(1);
    const body = await second.replayed!.json();
    expect(body.requestId).toBe("grok-req-replay-1");
    expect(body.replay).toBe(true);
  });

  it("returns 409 while the original job is in progress", async () => {
    clearRateLimits();
    const ledger = new AiCreditLedger(50);
    const session = await startAiSession({
      request: request(),
      service: "translate",
      authUserId: "user-prog",
      ledger,
      idempotencyKey: "in-progress-1",
    });
    expect(session.ok).toBe(true);
    const again = await startAiSession({
      request: request(),
      service: "translate",
      authUserId: "user-prog",
      ledger,
      idempotencyKey: "in-progress-1",
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    const replayed = replayDuplicateAi(again);
    expect(replayed?.status).toBe(409);
    expect(await replayed!.json()).toMatchObject({ error: { code: "IN_PROGRESS" } });
  });

  it("does not retry a failed job with the same idempotency key", async () => {
    clearRateLimits();
    const ledger = new AiCreditLedger(50);
    const provider = vi.fn(async () => {
      throw new Error("provider down");
    });
    const session = await startAiSession({
      request: request(),
      service: "translate",
      authUserId: "user-fail",
      ledger,
      idempotencyKey: "fail-key-1",
    });
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    try {
      await provider();
    } catch {
      await session.saveReplay({
        httpStatus: 502,
        body: { error: { code: "PROVIDER_ERROR", message: "provider down" } },
      });
      await session.finish({ status: "failed", errorCode: "PROVIDER_ERROR" });
    }
    const again = await startAiSession({
      request: request(),
      service: "translate",
      authUserId: "user-fail",
      ledger,
      idempotencyKey: "fail-key-1",
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    const replayed = replayDuplicateAi(again);
    expect(replayed?.status).toBe(502);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(await replayed!.json()).toMatchObject({ error: { code: "PROVIDER_ERROR" } });
  });
});

describe("Phase 2.2 voice and refund", () => {
  it("does not debit when ElevenLabs is missing", () => {
    const err = requireVoiceCloneProvider(false);
    expect(err?.status).toBe(503);
    expect(err?.code).toBe("NOT_CONFIGURED");
  });

  it("returns 403 for an unowned custom voice before any provider call", () => {
    const access = evaluateCustomVoiceAccess("stolen-voice-id", false);
    expect(access.ok).toBe(false);
    if (!access.ok) expect(access.status).toBe(403);
    expect(evaluateCustomVoiceAccess(undefined, false).ok).toBe(true);
  });

  it("credits a concurrent refund only once", async () => {
    const ledger = new AiCreditLedger(10);
    const debit = await ledger.debit({ profileId: "p1", amount: 4, jobId: "j1", idempotencyKey: "k1" });
    expect(debit.ok).toBe(true);
    if (!debit.ok) return;
    const [a, b] = await Promise.all([
      ledger.refund({ profileId: "p1", debitTxnId: debit.txnId, jobId: "j1" }),
      ledger.refund({ profileId: "p1", debitTxnId: debit.txnId, jobId: "j1" }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    expect(ledger.ensure("p1").balance).toBe(10);
    expect(ledger.txns.filter((t) => t.reason === "refund")).toHaveLength(1);
  });
});

describe("replay policy", () => {
  it("replays video request ids without a stored JSON body", () => {
    const decision = interpretDuplicateSession({
      duplicate: true,
      jobStatus: "succeeded",
      storedResult: null,
      providerRequestId: "grok-req-aaaaaaaa",
    });
    expect(decision.action).toBe("replay");
  });
});
