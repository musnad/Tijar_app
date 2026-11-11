/** E.164-ish phone for Africa's Talking and TIJAR shop records. */
export function normalizeUssdPhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return trimmed;
  if (digits.startsWith("234") && digits.length >= 13) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `+234${digits.slice(1)}`;
  if (digits.length === 10 && !trimmed.startsWith("+")) return `+234${digits}`;
  if (trimmed.startsWith("+")) return `+${digits}`;
  return `+${digits}`;
}

export function phoneLookupKeys(phone: string): string[] {
  const e164 = normalizeUssdPhone(phone);
  const digits = e164.replace(/\D/g, "");
  const local = digits.startsWith("234") ? `0${digits.slice(3)}` : "";
  return [...new Set([e164, `+${digits}`, digits, local].filter(Boolean))];
}
