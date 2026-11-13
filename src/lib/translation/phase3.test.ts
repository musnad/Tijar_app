import { describe, expect, it, vi } from "vitest";

import { selectAiProvider } from "@/lib/ai/providers";
import {
  applyHausaEnglishGlossary,
  isHausaEnglishPair,
  polishHausaEnglish,
  preserveShopTokens,
} from "@/lib/translation/hausa-english";
import { tijarWorkerTranslate } from "@/lib/translation/tijar-worker";

describe("Phase 3 Hausa ↔ English", () => {
  it("detects the launch pair", () => {
    expect(isHausaEnglishPair("English", "Hausa")).toBe(true);
    expect(isHausaEnglishPair("Hausa", "English")).toBe(true);
    expect(isHausaEnglishPair("English", "Yoruba")).toBe(false);
  });

  it("keeps naira amounts", () => {
    expect(preserveShopTokens("Rice ₦2,500", "Shinkafa")).toContain("₦2,500");
  });

  it("maps leftover English market words in a Hausa result", () => {
    expect(applyHausaEnglishGlossary("buy rice at the market", "English", "Hausa")).toMatch(/shinkafa/i);
    expect(applyHausaEnglishGlossary("buy rice at the market", "English", "Hausa")).toMatch(/kasuwa/i);
  });

  it("polishes a vendor mistranslation without dropping the price", () => {
    const out = polishHausaEnglish("How much is rice? ₦800", "How much is rice? ₦800", "English", "Hausa");
    expect(out.toLowerCase()).toContain("nawa");
    expect(out).toContain("₦800");
  });
});

describe("Phase 3 worker adapter", () => {
  it("does not select vLLM when the worker URL is unset", () => {
    expect(selectAiProvider("translate")).not.toBe("vllm");
    expect(selectAiProvider("assistant")).not.toBe("vllm");
  });

  it("posts signed JSON to the worker", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ translatedText: "shinkafa" }), { status: 200 }));
    const text = await tijarWorkerTranslate(
      { text: "rice", fromLanguage: "English", toLanguage: "Hausa" },
      { fetchImpl, url: "http://127.0.0.1:8080", secret: "test-secret-value", timeoutMs: 1000 },
    );
    expect(text).toBe("shinkafa");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("X-Tijar-Signature")).toMatch(/^[a-f0-9]{64}$/);
    expect(init.body).toContain("rice");
  });
});
