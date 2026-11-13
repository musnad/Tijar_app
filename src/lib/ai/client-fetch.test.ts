import { afterEach, describe, expect, it, vi } from "vitest";

import { aiFetch, readAiError } from "@/lib/ai/client-fetch";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("aiFetch", () => {
  it("retries 409 IN_PROGRESS with the same idempotency key", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: "IN_PROGRESS", message: "wait" } }), { status: 409 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ translatedText: "sannu" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await aiFetch(
      "/api/translate",
      { method: "POST", idempotencyKey: "same-key-12345", headers: { "Content-Type": "application/json" } },
      { maxInProgressRetries: 3 },
    );
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const keys = fetchMock.mock.calls.map((call) => (call[1] as RequestInit).headers);
    const headerList = keys.map((h) => new Headers(h as HeadersInit).get("Idempotency-Key"));
    expect(headerList[0]).toBe("same-key-12345");
    expect(headerList[1]).toBe("same-key-12345");
  });

  it("does not retry PRIOR_FAILED", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "PRIOR_FAILED", message: "failed" } }), { status: 409 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await aiFetch("/api/translate", { method: "POST", idempotencyKey: "fail-key-12345" });
    expect(res.status).toBe(409);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("readAiError", () => {
  it("maps 402 messages", async () => {
    const err = await readAiError(
      new Response(JSON.stringify({ error: { code: "INSUFFICIENT_CREDITS", message: "Not enough TIJAR AI credits for this action." } }), {
        status: 402,
      }),
    );
    expect(err.status).toBe(402);
    expect(err.code).toBe("INSUFFICIENT_CREDITS");
  });
});
