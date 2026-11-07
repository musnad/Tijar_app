export const PLATFORM_FEE_RATE = 0.03;
export const PLATFORM_FEE_MIN_NGN = 50;
export const PLATFORM_FEE_SETTLE_EMAIL = "musababubakar123@gmail.com";

export type PlatformFeeSplit = {
  gross: number;
  fee: number;
  net: number;
  rate: number;
};

export function platformFeeSplit(gross: number): PlatformFeeSplit {
  const amount = Number.isFinite(gross) && gross > 0 ? Math.round(gross * 100) / 100 : 0;
  if (amount <= 0) return { gross: 0, fee: 0, net: 0, rate: PLATFORM_FEE_RATE };
  const percent = Math.round(amount * PLATFORM_FEE_RATE * 100) / 100;
  const fee = Math.min(amount, Math.max(PLATFORM_FEE_MIN_NGN, percent));
  return {
    gross: amount,
    fee,
    net: Math.round((amount - fee) * 100) / 100,
    rate: PLATFORM_FEE_RATE,
  };
}
