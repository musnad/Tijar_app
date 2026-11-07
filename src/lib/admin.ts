import { PLATFORM_FEE_RATE, platformFeeSplit } from "@/lib/platform-fee";

export const TIJAR_SUPER_ADMIN_EMAIL = "musababubakar123@gmail.com";

/** TIJAR take on a paid sale: 3%, minimum ₦50. */
export const DEFAULT_PLATFORM_COMMISSION_RATE = PLATFORM_FEE_RATE;

export function isTijarSuperAdminEmail(email?: string | null): boolean {
  return (email ?? "").trim().toLowerCase() === TIJAR_SUPER_ADMIN_EMAIL;
}

export function platformCommission(amount: number, _rate = PLATFORM_FEE_RATE): number {
  return platformFeeSplit(amount).fee;
}
