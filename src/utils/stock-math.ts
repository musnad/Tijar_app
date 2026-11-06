export function isLowStock(stockQuantity: number, threshold: number): boolean {
  return stockQuantity <= threshold;
}

export function inventoryValue(stockQuantity: number, costPrice: number | null): number {
  if (costPrice == null || Number.isNaN(costPrice)) return 0;
  return stockQuantity * costPrice;
}

/** Expected profit if remaining stock sells at the listed price. */
export function inventoryProfit(
  stockQuantity: number,
  salePrice: number | null,
  costPrice: number | null,
): number {
  if (salePrice == null || costPrice == null || Number.isNaN(salePrice) || Number.isNaN(costPrice)) {
    return 0;
  }
  return stockQuantity * (salePrice - costPrice);
}

export function parseQuantity(raw: string): number | null {
  const v = raw.replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,3})?$/.test(v)) return null;
  const n = Number.parseFloat(v);
  return n > 0 ? n : null;
}
