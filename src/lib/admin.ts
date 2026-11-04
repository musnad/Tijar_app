export const TIJAR_SUPER_ADMIN_EMAIL = "musababubakar123@gmail.com";

/** TIJAR take on marketplace and recorded sales volume. 0 until we start collecting it. */
export const DEFAULT_PLATFORM_COMMISSION_RATE = 0;

export function isTijarSuperAdminEmail(email?: string | null): boolean {
  return (email ?? "").trim().toLowerCase() === TIJAR_SUPER_ADMIN_EMAIL;
}

export function platformCommission(amount: number, rate = DEFAULT_PLATFORM_COMMISSION_RATE): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * rate * 100) / 100;
}
