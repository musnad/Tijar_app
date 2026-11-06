import { z } from "zod";

/** Full Business DNA payload stored in Supabase (includes sensible defaults). */
export const onboardingAnswersSchema = z.object({
  businessName: z.string().min(2, "Business name is required"),
  categoryId: z.string().uuid("Choose a category"),
  location: z.string().min(2, "Location helps customers find you"),
  revenueModels: z.array(z.string()).min(1, "Select at least one"),
  customerTypes: z.array(z.string()).min(1, "Select at least one"),
  paymentMethods: z.array(z.string()).min(1, "Select at least one"),
  customerCredit: z.boolean(),
  supplierCredit: z.boolean(),
  managesInventory: z.boolean(),
  hasStaff: z.boolean(),
  recordKeeping: z.array(z.string()).min(1, "Select at least one"),
  discoveryChannels: z.array(z.string()).min(1, "Select at least one"),
  goals: z.array(z.string()).min(1, "Select at least one goal"),
  islamicMode: z.enum(["yes", "not_now"]),
});

export type OnboardingAnswers = z.infer<typeof onboardingAnswersSchema>;

/** What the simplified wizard collects (9 steps). */
export const onboardingWizardSchema = z.object({
  businessName: z.string().min(2, "Business name is required"),
  categoryId: z.string().uuid("Choose a category"),
  location: z.string().optional(),
  revenueModels: z.array(z.string()).min(1, "Select at least one"),
  paymentMethods: z.array(z.string()).min(1, "Select at least one"),
  customerCredit: z.boolean(),
  managesInventory: z.boolean(),
  hasStaff: z.boolean(),
  keepNotes: z.boolean(),
  discoveryChannels: z.array(z.string()).min(1, "Select at least one"),
  goals: z.array(z.string()).min(1, "Select at least one goal").max(2, "Choose up to 2"),
  islamicMode: z.enum(["yes", "not_now"]),
});

export type OnboardingWizardAnswers = z.infer<typeof onboardingWizardSchema>;

export function normalizeOnboardingAnswers(wizard: OnboardingWizardAnswers): OnboardingAnswers {
  return {
    businessName: wizard.businessName,
    categoryId: wizard.categoryId,
    location: wizard.location?.trim() || "Nigeria",
    revenueModels: wizard.revenueModels,
    paymentMethods: wizard.paymentMethods,
    customerCredit: wizard.customerCredit,
    supplierCredit: wizard.customerCredit,
    managesInventory: wizard.managesInventory,
    hasStaff: wizard.hasStaff,
    discoveryChannels: wizard.discoveryChannels,
    goals: wizard.goals,
    islamicMode: wizard.islamicMode,
    customerTypes: ["individuals"],
    recordKeeping: wizard.keepNotes ? ["notebook"] : ["memory"],
  };
}

export const registerSchema = z.object({
  fullName: z.string().min(2, "Enter your full name"),
  phone: z.string().min(7, "Enter a valid phone number"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  location: z.string().min(2, "Select or enter your location"),
  agreeTerms: z.literal(true, {
    errorMap: () => ({ message: "You must agree to the terms" }),
  }),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
