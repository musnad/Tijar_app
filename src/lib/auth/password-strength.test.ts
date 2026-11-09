import { describe, expect, it } from "vitest";

import { analyzePassword, passwordLooksPersonal, passwordRequirementIssue } from "./password-strength";

describe("password strength", () => {
  it("rejects short and simple passwords", () => {
    expect(analyzePassword("secret1").valid).toBe(false);
    expect(passwordRequirementIssue("secret1")).toMatch(/uppercase|symbol|8 characters/i);
  });

  it("accepts a mixed strong password", () => {
    expect(analyzePassword("ShopSafe!9").valid).toBe(true);
    expect(passwordRequirementIssue("ShopSafe!9")).toBeNull();
  });

  it("flags common passwords", () => {
    expect(analyzePassword("password123").common).toBe(true);
    expect(analyzePassword("password123").valid).toBe(false);
  });

  it("detects personal details reused in the password", () => {
    expect(
      passwordLooksPersonal("AishaMart!9", { fullName: "Aisha Mart", email: "aisha@example.com" }),
    ).toBe(true);
    expect(passwordLooksPersonal("KanoSafe!9", { fullName: "Musa Bello", email: "m@example.com" })).toBe(
      false,
    );
  });
});
