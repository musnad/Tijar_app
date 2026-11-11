import { describe, expect, it } from "vitest";

import { normalizeUssdPhone, phoneLookupKeys } from "./phone";

describe("normalizeUssdPhone", () => {
  it("turns local Nigeria numbers into +234", () => {
    expect(normalizeUssdPhone("08031234567")).toBe("+2348031234567");
  });

  it("keeps sandbox E.164 numbers", () => {
    expect(normalizeUssdPhone("+254711123456")).toBe("+254711123456");
  });

  it("includes lookup variants", () => {
    expect(phoneLookupKeys("08031234567")).toContain("+2348031234567");
    expect(phoneLookupKeys("08031234567")).toContain("08031234567");
  });
});
