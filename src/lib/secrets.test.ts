import { describe, expect, it } from "vitest";

import { sanitizeSecret } from "./secrets";

describe("sanitizeSecret", () => {
  it("strips quotes, spaces, and Bearer", () => {
    expect(sanitizeSecret('"xai-test"')).toBe("xai-test");
    expect(sanitizeSecret("Bearer xai-test")).toBe("xai-test");
    expect(sanitizeSecret("  xai-test  ")).toBe("xai-test");
  });
});
