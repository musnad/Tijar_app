export function shopDeliveryFee(fulfilment: string, shopFee?: number | null): number {
  if (fulfilment === "pickup") return 0;
  const n = Number(shopFee ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

export function canBuyerMarkReceived(status: string): boolean {
  return ["paid", "confirmed", "processing", "shipped", "ready_for_pickup", "preparing", "ready"].includes(status);
}

export function canBuyerMarkPlaceOrderReceived(status: string): boolean {
  return ["paid", "preparing", "ready"].includes(status);
}
