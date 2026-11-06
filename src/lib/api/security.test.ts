import { describe, expect, it } from "vitest";

import {
  TRANSLATE_MAX_BODY_BYTES,
  allowedTranslateOrigins,
  assertJsonContentType,
  assertTranslateOrigin,
  clientIp,
  readJsonBody,
} from "./security";

describe("api-security", () => {
  it("binds rate keys to client IP from forwarded headers", () => {
    const req = new Request("https://tijar-two.vercel.app/api/translate", {
      headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" },
    });
    expect(clientIp(req)).toBe("203.0.113.10");
  });

  it("allows the request host and configured public origin", () => {
    const origins = allowedTranslateOrigins("https://tijar-two.vercel.app/api/translate");
    expect(origins.has("https://tijar-two.vercel.app")).toBe(true);
    expect(origins.has("http://localhost:3000")).toBe(true);
  });

  it("rejects foreign browser Origin", () => {
    const req = new Request("https://tijar-two.vercel.app/api/translate", {
      method: "POST",
      headers: { Origin: "https://evil.example" },
    });
    expect(assertTranslateOrigin(req)).toMatchObject({ ok: false, code: "FORBIDDEN_ORIGIN", status: 403 });
  });

  it("allows same-site Origin", () => {
    const req = new Request("https://tijar-two.vercel.app/api/translate", {
      method: "POST",
      headers: { Origin: "https://tijar-two.vercel.app" },
    });
    expect(assertTranslateOrigin(req)).toEqual({ ok: true });
  });

  it("requires application/json", () => {
    const bad = new Request("https://tijar-two.vercel.app/api/translate", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
    });
    expect(assertJsonContentType(bad)).toMatchObject({ ok: false, status: 415 });
    const good = new Request("https://tijar-two.vercel.app/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(assertJsonContentType(good)).toEqual({ ok: true });
  });

  it("rejects oversized JSON bodies", async () => {
    const huge = "x".repeat(TRANSLATE_MAX_BODY_BYTES + 10);
    const req = new Request("https://tijar-two.vercel.app/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": String(huge.length) },
      body: JSON.stringify({ text: huge }),
    });
    const result = await readJsonBody(req, TRANSLATE_MAX_BODY_BYTES);
    expect(result).toMatchObject({ ok: false, code: "PAYLOAD_TOO_LARGE", status: 413 });
  });

  it("parses valid small JSON", async () => {
    const req = new Request("https://tijar-two.vercel.app/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Hello", fromLanguage: "English", toLanguage: "Yoruba" }),
    });
    const result = await readJsonBody(req, TRANSLATE_MAX_BODY_BYTES);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body).toMatchObject({ text: "Hello" });
    }
  });
});
