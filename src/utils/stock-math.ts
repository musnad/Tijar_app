export function isLowStock(stockQuantity: number, threshold: number): boolean {
  return stockQuantity <= threshold;
}

export function inventoryValue(stockQuantity: number, costPrice: number | null): number {
  if (costPrice == null || Number.isNaN(costPrice)) return 0;
  return stockQuantity * costPrice;
}

/** Markup left on the shelf: (selling − cost) × quantity. Not selling total. */
export function inventoryProfit(
  stockQuantity: number,
  costPrice: number | null,
  salePrice: number | null,
): number {
  if (costPrice == null || salePrice == null) return 0;
  if (Number.isNaN(costPrice) || Number.isNaN(salePrice)) return 0;
  const qty = Number.isFinite(stockQuantity) ? stockQuantity : 0;
  if (qty <= 0) return 0;
  return qty * (salePrice - costPrice);
}

export function parseQuantity(raw: string): number | null {
  const v = raw.replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,3})?$/.test(v)) return null;
  const n = Number.parseFloat(v);
  return n > 0 ? n : null;
}
