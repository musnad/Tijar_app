export const TIJAR_SUPER_ADMIN_EMAIL = "musababubakar123@gmail.com";

/** Default TIJAR take on marketplace and recorded sales volume. */
export const DEFAULT_PLATFORM_COMMISSION_RATE = 0.025;

export function isTijarSuperAdminEmail(email?: string | null): boolean {
  return (email ?? "").trim().toLowerCase() === TIJAR_SUPER_ADMIN_EMAIL;
}

export function platformCommission(amount: number, rate = DEFAULT_PLATFORM_COMMISSION_RATE): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * rate * 100) / 100;
}
