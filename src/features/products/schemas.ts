import { z } from "zod";

/** Accept ₦15,000 / 15 000 / 15k / plain digits from shopkeepers. */
export function normalizeMoneyRaw(raw: string | undefined): string | undefined {
  if (raw == null) return undefined;
  let s = raw.trim();
  if (!s) return undefined;
  s = s
    .replace(/₦/g, "")
    .replace(/\bngn\b/gi, "")
    .replace(/\bnaira\b/gi, "")
    .replace(/,/g, "")
    .replace(/\s+/g, "");
  const kMatch = /^(\d+(?:\.\d+)?)k$/i.exec(s);
  if (kMatch) {
    const n = Number.parseFloat(kMatch[1]!) * 1_000;
    return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : undefined;
  }
  return s || undefined;
}

export function normalizeQtyRaw(raw: string | undefined): string | undefined {
  if (raw == null) return undefined;
  let s = raw.trim();
  if (!s) return undefined;
  s = s.replace(/,/g, "").replace(/\s+/g, "");
  return s || undefined;
}

const moneyOptional = z
  .string()
  .optional()
  .transform((raw) => normalizeMoneyRaw(raw))
  .refine((v) => v === undefined || /^\d+(\.\d{1,2})?$/.test(v), "Enter a valid amount")
  .transform((v) => (v === undefined ? undefined : Number.parseFloat(v)))
  .refine((n) => n === undefined || (Number.isFinite(n) && n >= 0), "Enter a valid amount");

const qtySchema = z
  .string()
  .min(1, "Enter quantity")
  .transform((raw) => normalizeQtyRaw(raw) ?? "")
  .refine((v) => /^\d+(\.\d{1,3})?$/.test(v), "Enter a valid quantity")
  .transform((v) => Number.parseFloat(v))
  .refine((n) => Number.isFinite(n) && n > 0, "Quantity must be greater than zero");

const optionalQtyFromString = z
  .string()
  .optional()
  .transform((raw) => normalizeQtyRaw(raw))
  .refine((v) => v === undefined || /^\d+(\.\d{1,3})?$/.test(v), "Enter a valid quantity")
  .transform((v) => (v === undefined ? undefined : Number.parseFloat(v)))
  .refine((n) => n === undefined || (Number.isFinite(n) && n >= 0), "Enter a valid quantity");

export const productFormSchema = z.object({
  name: z.string().trim().min(1, "Product name is required").max(120),
  kind: z.enum(["goods", "service"]).default("goods"),
  unit: z.string().min(1).max(30).default("piece"),
  salePrice: moneyOptional,
  costPrice: moneyOptional,
  initialStock: optionalQtyFromString,
  lowStockThreshold: optionalQtyFromString,
  notes: z.string().max(500).optional(),
  description: z.string().max(4000).optional(),
  catalogueCategory: z.string().max(80).optional(),
  colour: z.string().max(40).optional(),
  size: z.string().max(40).optional(),
  sizes: z.string().max(200).optional(),
  colours: z.string().max(200).optional(),
  videoUrl: z.string().max(500).optional(),
  isPublished: z.boolean().optional(),
  serviceType: z.enum(["general", "course", "mentorship"]).optional(),
  startsOn: z.string().optional(),
  endsOn: z.string().optional(),
});

export type ProductFormInput = z.infer<typeof productFormSchema>;

export const stockAdjustSchema = z.object({
  direction: z.enum(["in", "out"]),
  quantity: qtySchema,
  reason: z.enum(["purchase", "sale", "adjustment", "return"]),
  notes: z.string().max(500).optional(),
});

export type StockAdjustInput = z.infer<typeof stockAdjustSchema>;
