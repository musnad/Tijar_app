export const CORV_FEE_RATE = 0.01;
export const WALLET_TIJAR_RATE = 0.01;
export const PLATFORM_FEE_RATE = 0.03;
export const PLATFORM_FEE_MIN_NGN = 50;
export const PLATFORM_FEE_SETTLE_EMAIL = "musababubakar123@gmail.com";

export type PaymentProcessor = "corv" | "paystack" | "flutterwave" | "other";

export type PlatformFeeSplit = {
  gross: number;
  fee: number;
  net: number;
  rate: number;
};

export type WalletInboundSplit = {
  landed: number;
  gross: number;
  corvFee: number;
  tijarKeep: number;
  userNet: number;
};

export type SaleFeeSplit = {
  gross: number;
  totalFee: number;
  corvFee: number;
  tijarKeep: number;
  sellerNet: number;
  rate: number;
};

export function money(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

/** Corvi often credits 99% of the sent amount. Recover the original send when that is exact. */
export function inferGrossFromLanded(landed: number): number {
  const amount = money(landed);
  if (amount <= 0) return 0;
  const kobo = Math.round(amount * 100);
  if (kobo > 0 && kobo % 99 === 0) return money(kobo / 99);
  return amount;
}

export function walletInboundSplit(landed: number): WalletInboundSplit {
  const amount = money(landed);
  if (amount <= 0) {
    return { landed: 0, gross: 0, corvFee: 0, tijarKeep: 0, userNet: 0 };
  }
  const gross = inferGrossFromLanded(amount);
  const corvFee = money(gross - amount);
  const tijarKeep = money(gross * WALLET_TIJAR_RATE);
  const userNet = money(amount - tijarKeep);
  return { landed: amount, gross, corvFee, tijarKeep, userNet };
}

export function saleFeeSplit(gross: number, processor: PaymentProcessor = "corv"): SaleFeeSplit {
  const amount = money(gross);
  if (amount <= 0) {
    return { gross: 0, totalFee: 0, corvFee: 0, tijarKeep: 0, sellerNet: 0, rate: PLATFORM_FEE_RATE };
  }
  const percent = money(amount * PLATFORM_FEE_RATE);
  const totalFee = Math.min(amount, Math.max(PLATFORM_FEE_MIN_NGN, percent));
  const corvFee = processor === "corv" ? Math.min(money(amount * CORV_FEE_RATE), totalFee) : 0;
  const tijarKeep = money(totalFee - corvFee);
  const sellerNet = money(amount - totalFee);
  return { gross: amount, totalFee, corvFee, tijarKeep, sellerNet, rate: PLATFORM_FEE_RATE };
}

/** Seller-facing 3% take (includes Corvi’s 1% on Corvi sales). */
export function platformFeeSplit(gross: number): PlatformFeeSplit {
  const split = saleFeeSplit(gross, "corv");
  return { gross: split.gross, fee: split.totalFee, net: split.sellerNet, rate: split.rate };
}

export function saleTopUpKeep(saleKeep: number, alreadyWalletKeep: number): number {
  return money(Math.max(saleKeep - Math.max(0, alreadyWalletKeep), 0));
}
