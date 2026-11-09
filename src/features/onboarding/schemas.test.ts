import { describe, expect, it } from "vitest";

import {
  normalizeOnboardingAnswers,
  onboardingAnswersSchema,
  onboardingWizardSchema,
  registerSchema,
} from "./schemas";

describe("onboardingAnswersSchema", () => {
  it("accepts a complete onboarding payload", () => {
    const reg = registerSchema.safeParse({
      fullName: "Aisha",
      phone: "+2348000000000",
      email: "a@example.com",
      password: "ShopSafe!9",
      state: "Kano",
      lga: "Nassarawa",
      location: "Nassarawa, Kano",
      agreeTerms: true as const,
    });
    expect(reg.success).toBe(true);

    const result = onboardingAnswersSchema.safeParse({
      businessName: "Aisha Fashion",
      categoryId: "550e8400-e29b-41d4-a716-446655440000",
      location: "Kano, Nigeria",
      revenueModels: ["retail"],
      customerTypes: ["individuals"],
      paymentMethods: ["cash", "transfer"],
      customerCredit: true,
      supplierCredit: false,
      managesInventory: true,
      hasStaff: false,
      recordKeeping: ["notebook"],
      discoveryChannels: ["whatsapp"],
      goals: ["manage_debt"],
      islamicMode: "yes",
    });
    expect(result.success).toBe(true);
  });

  it("normalizes simplified wizard answers into full DNA", () => {
    const wizard = onboardingWizardSchema.parse({
      businessName: "Aisha Fashion",
      categoryId: "550e8400-e29b-41d4-a716-446655440000",
      location: "Kano",
      revenueModels: ["retail"],
      paymentMethods: ["cash"],
      customerCredit: false,
      managesInventory: true,
      hasStaff: false,
      keepNotes: true,
      discoveryChannels: ["whatsapp"],
      goals: ["increase_sales"],
      islamicMode: "not_now",
    });
    const full = normalizeOnboardingAnswers(wizard);
    expect(onboardingAnswersSchema.safeParse(full).success).toBe(true);
    expect(full.customerTypes).toEqual(["individuals"]);
    expect(full.recordKeeping).toEqual(["notebook"]);
  });
});
