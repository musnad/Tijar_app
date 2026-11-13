import { normalizeUssdPhone } from "@/lib/ussd/phone";

export function whatsappDigits(phone: string): string | null {
  const digits = normalizeUssdPhone(phone).replace(/\D/g, "");
  return digits || null;
}

export function displayNgPhone(phone: string): string {
  const digits = whatsappDigits(phone);
  if (!digits) return phone.trim();
  if (digits.startsWith("234") && digits.length >= 13) return `0${digits.slice(3)}`;
  return `+${digits}`;
}

export function whatsappChatUrl(phone: string, text?: string): string | null {
  const digits = whatsappDigits(phone);
  if (!digits) return null;
  const q = text?.trim() ? `?text=${encodeURIComponent(text.trim())}` : "";
  return `https://wa.me/${digits}${q}`;
}

export function paymentReceiptMessage(input: {
  shopName: string;
  orderRef: string;
  items: string;
  amountLabel: string;
}): string {
  return [
    "TIJAR payment receipt",
    `Shop: ${input.shopName}`,
    `Order: ${input.orderRef}`,
    `Items: ${input.items}`,
    `Amount paid: ${input.amountLabel}`,
    "",
    "I have paid this order. Please confirm.",
  ].join("\n");
}
