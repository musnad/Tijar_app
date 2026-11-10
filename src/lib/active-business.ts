export const ACTIVE_SHOP_EVENT = "tijar-active-shop";

export function activeShopStorageKey(profileId: string): string {
  return `tijar-active-shop:${profileId}`;
}

export function readActiveShopId(profileId: string | undefined | null): string | null {
  if (!profileId || typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(activeShopStorageKey(profileId));
  } catch {
    return null;
  }
}

export function writeActiveShopId(profileId: string, businessId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(activeShopStorageKey(profileId), businessId);
  window.dispatchEvent(new Event(ACTIVE_SHOP_EVENT));
}
