export const GOODS_UNITS = ["piece", "bag", "carton", "kg", "litre", "yard", "metre"] as const;
export type GoodsUnit = (typeof GOODS_UNITS)[number];

const LENGTH_UNITS = new Set(["yard", "yards", "metre", "meter", "metres", "meters"]);

export function isLengthUnit(unit: string | null | undefined): boolean {
  return LENGTH_UNITS.has((unit ?? "").trim().toLowerCase());
}

export function isMeasuredUnit(unit: string | null | undefined): boolean {
  const u = (unit ?? "").trim().toLowerCase();
  return isLengthUnit(u) || u === "kg" || u === "litre" || u === "liter";
}

export function unitStep(unit: string | null | undefined): number {
  return isLengthUnit(unit) ? 0.5 : isMeasuredUnit(unit) ? 0.5 : 1;
}

export function unitMinQty(unit: string | null | undefined): number {
  return isLengthUnit(unit) ? 0.5 : 1;
}

export function normalizeQty(value: number, unit: string | null | undefined): number {
  const min = unitMinQty(unit);
  const step = unitStep(unit);
  if (!Number.isFinite(value) || value < min) return min;
  const rounded = Math.round(value / step) * step;
  return Math.round(rounded * 1000) / 1000;
}

export function formatUnitWord(unit: string | null | undefined, qty = 1): string {
  const u = (unit ?? "piece").trim().toLowerCase();
  if (u === "yard" || u === "yards") return qty === 1 ? "yard" : "yards";
  if (u === "metre" || u === "meter" || u === "metres" || u === "meters") return qty === 1 ? "metre" : "metres";
  if (u === "piece" || u === "pcs") return qty === 1 ? "piece" : "pieces";
  if (u === "bag") return qty === 1 ? "bag" : "bags";
  if (u === "carton") return qty === 1 ? "carton" : "cartons";
  if (u === "job") return "job";
  return u || "piece";
}

export function formatPricePerUnit(price: number, unit: string | null | undefined, money: (n: number) => string): string {
  const u = (unit ?? "piece").trim().toLowerCase();
  if (!u || u === "piece" || u === "job") return money(price);
  return `${money(price)} / ${formatUnitWord(u, 1)}`;
}

export function lineTotal(unitPrice: number, qty: number): number {
  return Math.round(Number(unitPrice) * Number(qty) * 100) / 100;
}
