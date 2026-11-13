import { describe, expect, it } from "vitest";

import { providerModelHint, selectAiProvider } from "@/lib/ai/providers";

describe("AI provider adapters", () => {
  it("does not select vLLM unless a TIJAR translate worker URL is set", () => {
    expect(selectAiProvider("translate")).not.toBe("vllm");
    expect(selectAiProvider("stt")).not.toBe("vllm");
    expect(selectAiProvider("video")).not.toBe("vllm");
    expect(selectAiProvider("search_image")).not.toBe("vllm");
    expect(providerModelHint("vllm", "assistant")).toBe("tijar-vllm");
  });

  it("maps existing vendors to model hints", () => {
    expect(providerModelHint("xai", "assistant")).toBe("grok");
    expect(providerModelHint("openai", "stt")).toBe("whisper-1");
    expect(providerModelHint("elevenlabs", "tts")).toBe("eleven_multilingual");
  });
});
