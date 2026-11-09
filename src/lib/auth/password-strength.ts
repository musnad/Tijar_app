import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 8;

export type PasswordCheckId = "length" | "lower" | "upper" | "number" | "symbol";

export type PasswordCheck = {
  id: PasswordCheckId;
  label: string;
  hint: string;
  met: boolean;
};

export type PasswordScore = "empty" | "weak" | "fair" | "good" | "strong";

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password12",
  "password123",
  "passw0rd",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty123",
  "qwertyui",
  "abcdefgh",
  "letmein1",
  "welcome1",
  "welcome123",
  "tijar123",
  "tijar1234",
  "nigeria1",
  "nigeria123",
  "admin123",
  "iloveyou",
  "abc12345",
  "00000000",
  "11111111",
]);

export const PASSWORD_CHECKS: Array<Omit<PasswordCheck, "met">> = [
  {
    id: "length",
    label: "At least 8 characters",
    hint: "Make it at least 8 characters long.",
  },
  {
    id: "lower",
    label: "A lowercase letter (a–z)",
    hint: "Add a lowercase letter (a–z).",
  },
  {
    id: "upper",
    label: "An uppercase letter (A–Z)",
    hint: "Add an uppercase letter (A–Z).",
  },
  {
    id: "number",
    label: "A number (0–9)",
    hint: "Add a number (0–9).",
  },
  {
    id: "symbol",
    label: "A symbol (! @ # $ %)",
    hint: "Add a symbol such as ! @ # $ or %.",
  },
];

function isCommonPassword(password: string) {
  return COMMON_PASSWORDS.has(password.trim().toLowerCase());
}

export function analyzePassword(password: string) {
  const value = password ?? "";
  const checks: PasswordCheck[] = PASSWORD_CHECKS.map((check) => {
    let met = false;
    if (check.id === "length") met = value.length >= PASSWORD_MIN_LENGTH;
    if (check.id === "lower") met = /[a-z]/.test(value);
    if (check.id === "upper") met = /[A-Z]/.test(value);
    if (check.id === "number") met = /\d/.test(value);
    if (check.id === "symbol") met = /[^A-Za-z0-9]/.test(value);
    return { ...check, met };
  });

  const common = value.length > 0 && isCommonPassword(value);
  const metCount = checks.filter((check) => check.met).length;
  let score: PasswordScore = "empty";
  if (value.length === 0) {
    score = "empty";
  } else if (common || metCount <= 2) {
    score = "weak";
  } else if (metCount === 3) {
    score = "fair";
  } else if (metCount === 4) {
    score = "good";
  } else {
    score = "strong";
  }

  const suggestions: string[] = [];
  if (common) {
    suggestions.push("This password is too easy to guess. Choose something unique.");
  }
  for (const check of checks) {
    if (!check.met) suggestions.push(check.hint);
  }
  if (metCount === 5 && !common && value.length < 12) {
    suggestions.push("Optional: 12 or more characters is even stronger.");
  }

  const valid = metCount === 5 && !common;
  return { checks, score, suggestions, valid, common, metCount };
}

export function passwordRequirementIssue(password: string): string | null {
  const analysis = analyzePassword(password);
  if (analysis.valid) return null;
  return analysis.suggestions[0] ?? "Choose a stronger password.";
}

export const strongPasswordSchema = z.string().superRefine((value, ctx) => {
  const issue = passwordRequirementIssue(value);
  if (issue) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue });
  }
});

export function passwordLooksPersonal(
  password: string,
  parts: { email?: string; phone?: string; fullName?: string },
) {
  const lower = password.toLowerCase();
  const emailLocal = parts.email?.split("@")[0]?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  if (emailLocal.length >= 4 && lower.includes(emailLocal)) return true;
  const digits = (parts.phone ?? "").replace(/\D/g, "");
  if (digits.length >= 7 && lower.includes(digits.slice(-7))) return true;
  const nameBits = (parts.fullName ?? "")
    .toLowerCase()
    .split(/\s+/)
    .map((bit) => bit.replace(/[^a-z]/g, ""))
    .filter((bit) => bit.length >= 4);
  return nameBits.some((bit) => lower.includes(bit));
}
